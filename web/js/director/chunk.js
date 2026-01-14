/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ReadStream, BufferView } from '../stream.js';
import { Endianness, FOURCC, fourCCToString } from '../lingodec/enums.js';
import { MemoryMapEntry, KeyTableEntry, CastListEntry } from './subchunk.js';

// Chunk type enum
export const ChunkType = {
    kCastChunk: 0,
    kCastListChunk: 1,
    kCastMemberChunk: 2,
    kCastInfoChunk: 3,
    kConfigChunk: 4,
    kInitialMapChunk: 5,
    kKeyTableChunk: 6,
    kMemoryMapChunk: 7,
    kScriptChunk: 8,
    kScriptContextChunk: 9,
    kScriptNamesChunk: 10
};

// Member type enum
export const MemberType = {
    kNullMember: 0,
    kBitmapMember: 1,
    kFilmLoopMember: 2,
    kTextMember: 3,
    kPaletteMember: 4,
    kPictureMember: 5,
    kSoundMember: 6,
    kButtonMember: 7,
    kShapeMember: 8,
    kMovieMember: 9,
    kDigitalVideoMember: 10,
    kScriptMember: 11,
    kRTEMember: 12
};

// Script type enum
export const ScriptType = {
    kScoreScript: 1,
    kMovieScript: 3,
    kParentScript: 7
};

/**
 * Convert internal Director version to human-readable version
 */
export function humanVersion(ver) {
    if (ver >= 1951) return 1200;
    if (ver >= 1922) return 1150;
    if (ver >= 1921) return 1100;
    if (ver >= 1851) return 1000;
    if (ver >= 1700) return 850;
    if (ver >= 1410) return 800;
    if (ver >= 1224) return 700;
    if (ver >= 1218) return 600;
    if (ver >= 1201) return 500;
    if (ver >= 1117) return 404;
    if (ver >= 1115) return 400;
    if (ver >= 1029) return 310;
    if (ver >= 1028) return 300;
    return 200;
}

/**
 * Base Chunk class
 */
export class Chunk {
    constructor(dir, chunkType) {
        this.dir = dir;
        this.chunkType = chunkType;
        this.writable = false;
    }

    read(stream) {
        // Override in subclasses
    }

    size() {
        return 0;
    }
}

/**
 * ListChunk - Base class for list-based chunks
 */
export class ListChunk extends Chunk {
    constructor(dir, chunkType) {
        super(dir, chunkType);
        this.dataOffset = 0;
        this.offsetTableLen = 0;
        this.offsetTable = [];
        this.itemsLen = 0;
        this.itemEndianness = Endianness.kBigEndian;
        this.items = [];
    }

    read(stream) {
        this.readHeader(stream);
        this.readOffsetTable(stream);
        this.readItems(stream);
    }

    readHeader(stream) {
        this.dataOffset = stream.readUint32();
    }

    readOffsetTable(stream) {
        stream.seek(this.dataOffset);
        this.offsetTableLen = stream.readUint16();
        this.offsetTable = [];
        for (let i = 0; i < this.offsetTableLen; i++) {
            this.offsetTable.push(stream.readUint32());
        }
    }

    readItems(stream) {
        this.itemsLen = stream.readUint32();
        this.itemEndianness = stream.endianness;
        const listOffset = stream.pos;

        this.items = [];
        for (let i = 0; i < this.offsetTableLen; i++) {
            const offset = this.offsetTable[i];
            const nextOffset = (i === this.offsetTableLen - 1) ? this.itemsLen : this.offsetTable[i + 1];
            stream.seek(listOffset + offset);
            this.items.push(stream.readByteView(nextOffset - offset));
        }
    }

    readString(index) {
        if (index >= this.offsetTableLen) return '';
        const item = this.items[index];
        const stream = new ReadStream(item, this.itemEndianness);
        return stream.readString(stream.size);
    }

    readPascalString(index) {
        if (index >= this.offsetTableLen) return '';
        const item = this.items[index];
        const stream = new ReadStream(item, this.itemEndianness);
        if (stream.size === 0) return '';
        return stream.readPascalString();
    }

    readUint16(index) {
        if (index >= this.offsetTableLen) return 0;
        const item = this.items[index];
        const stream = new ReadStream(item, this.itemEndianness);
        return stream.readUint16();
    }

    readUint32(index) {
        if (index >= this.offsetTableLen) return 0;
        const item = this.items[index];
        const stream = new ReadStream(item, this.itemEndianness);
        return stream.readUint32();
    }
}

/**
 * CastChunk - Contains cast member IDs
 */
export class CastChunk extends Chunk {
    constructor(dir) {
        super(dir, ChunkType.kCastChunk);
        this.memberIDs = [];
        this.name = '';
        this.members = new Map();
        this.lctx = null;
    }

    read(stream) {
        stream.endianness = Endianness.kBigEndian;
        while (!stream.eof()) {
            const id = stream.readInt32();
            this.memberIDs.push(id);
        }
    }

    populate(castName, id, minMember) {
        this.name = castName;
        console.log('CastChunk.populate:', castName, 'id:', id, 'minMember:', minMember);

        // Find script context
        for (const entry of this.dir.keyTable.entries) {
            if (entry.castID === id &&
                (entry.fourCC === FOURCC('L', 'c', 't', 'x') || entry.fourCC === FOURCC('L', 'c', 't', 'X')) &&
                this.dir.chunkExists(entry.fourCC, entry.sectionID)) {
                this.lctx = this.dir.getChunk(entry.fourCC, entry.sectionID);
                break;
            }
        }

        // Populate members
        for (let i = 0; i < this.memberIDs.length; i++) {
            const sectionID = this.memberIDs[i];
            if (sectionID > 0) {
                const member = this.dir.getChunk(FOURCC('C', 'A', 'S', 't'), sectionID);
                member.id = i + minMember;
                member.castSectionID = sectionID;  // Store the CASt chunk's section ID
                member.castLibID = id;  // Store the cast library ID
                if (this.lctx && this.lctx.scripts.has(member.getScriptID())) {
                    member.script = this.lctx.scripts.get(member.getScriptID());
                    member.script.member = member;
                }
                this.members.set(member.id, member);
            }
        }
    }
}

/**
 * CastListChunk - List of cast libraries
 */
export class CastListChunk extends ListChunk {
    constructor(dir) {
        super(dir, ChunkType.kCastListChunk);
        this.unk0 = 0;
        this.castCount = 0;
        this.itemsPerCast = 0;
        this.unk1 = 0;
        this.entries = [];
    }

    read(stream) {
        stream.endianness = Endianness.kBigEndian;
        super.read(stream);

        this.entries = [];
        for (let i = 0; i < this.castCount; i++) {
            const entry = new CastListEntry();
            if (this.itemsPerCast >= 1) {
                entry.name = this.readPascalString(i * this.itemsPerCast + 1);
            }
            if (this.itemsPerCast >= 2) {
                entry.filePath = this.readPascalString(i * this.itemsPerCast + 2);
            }
            if (this.itemsPerCast >= 3) {
                entry.preloadSettings = this.readUint16(i * this.itemsPerCast + 3);
            }
            if (this.itemsPerCast >= 4) {
                const item = this.items[i * this.itemsPerCast + 4];
                const itemStream = new ReadStream(item, this.itemEndianness);
                entry.minMember = itemStream.readUint16();
                entry.maxMember = itemStream.readUint16();
                entry.id = itemStream.readInt32();
            }
            this.entries.push(entry);
        }
    }

    readHeader(stream) {
        this.dataOffset = stream.readUint32();
        this.unk0 = stream.readUint16();
        this.castCount = stream.readUint16();
        this.itemsPerCast = stream.readUint16();
        this.unk1 = stream.readUint16();
    }
}

/**
 * CastInfoChunk - Info about a cast member
 */
export class CastInfoChunk extends ListChunk {
    constructor(dir) {
        super(dir, ChunkType.kCastInfoChunk);
        this.writable = true;
        this.unk1 = 0;
        this.unk2 = 0;
        this.flags = 0;
        this.scriptId = 0;
        this.scriptSrcText = '';
        this.name = '';
    }

    read(stream) {
        super.read(stream);
        this.scriptSrcText = this.readString(0);
        this.name = this.readPascalString(1);

        // Workaround: Increase table len for decompilation results
        if (this.offsetTableLen === 0) {
            this.offsetTableLen = 1;
            this.offsetTable = [0];
        }
    }

    readHeader(stream) {
        this.dataOffset = stream.readUint32();
        this.unk1 = stream.readUint32();
        this.unk2 = stream.readUint32();
        this.flags = stream.readUint32();
        this.scriptId = stream.readUint32();
    }
}

/**
 * CastMemberChunk - A single cast member
 */
export class CastMemberChunk extends Chunk {
    constructor(dir) {
        super(dir, ChunkType.kCastMemberChunk);
        this.writable = true;
        this.type = MemberType.kNullMember;
        this.infoLen = 0;
        this.specificDataLen = 0;
        this.info = null;
        this.specificData = null;
        this.member = null;
        this.hasFlags1 = false;
        this.flags1 = 0;
        this.id = 0;
        this.script = null;
    }

    read(stream) {
        stream.endianness = Endianness.kBigEndian;

        if (this.dir.version >= 500) {
            this.type = stream.readUint32();
            this.infoLen = stream.readUint32();
            this.specificDataLen = stream.readUint32();

            // info
            if (this.infoLen) {
                const infoView = stream.readByteView(this.infoLen);
                const infoStream = new ReadStream(infoView, stream.endianness);
                this.info = new CastInfoChunk(this.dir);
                this.info.read(infoStream);
            }

            // specific data
            this.hasFlags1 = false;
            this.specificData = stream.readByteView(this.specificDataLen);
        } else {
            this.specificDataLen = stream.readUint16();
            this.infoLen = stream.readUint32();

            // these bytes are common but stored in the specific data
            let specificDataLeft = this.specificDataLen;
            this.type = stream.readUint8();
            specificDataLeft -= 1;

            if (specificDataLeft) {
                this.hasFlags1 = true;
                this.flags1 = stream.readUint8();
                specificDataLeft -= 1;
            } else {
                this.hasFlags1 = false;
            }

            // specific data
            this.specificData = stream.readByteView(specificDataLeft);

            // info
            if (this.infoLen) {
                const infoView = stream.readByteView(this.infoLen);
                const infoStream = new ReadStream(infoView, stream.endianness);
                this.info = new CastInfoChunk(this.dir);
                this.info.read(infoStream);
            }
        }

        // Parse script member specific data
        if (this.type === MemberType.kScriptMember && this.specificData) {
            const specificStream = new ReadStream(this.specificData, stream.endianness);
            if (specificStream.size >= 2) {
                this.scriptType = specificStream.readUint16();
            }
        }
    }

    getScriptID() {
        if (this.info) {
            return this.info.scriptId;
        }
        return 0;
    }

    getScriptText() {
        if (this.info) {
            return this.info.scriptSrcText;
        }
        return '';
    }

    setScriptText(val) {
        if (!this.info) {
            console.warn('Tried to set scriptText on member with no info!');
            return;
        }
        this.info.scriptSrcText = val;
    }

    getName() {
        if (this.info) {
            return this.info.name;
        }
        return '';
    }
}

/**
 * ConfigChunk - Movie configuration
 */
export class ConfigChunk extends Chunk {
    constructor(dir) {
        super(dir, ChunkType.kConfigChunk);
        this.writable = true;
    }

    read(stream) {
        stream.endianness = Endianness.kBigEndian;

        stream.seek(36);
        this.directorVersion = stream.readInt16();
        const ver = humanVersion(this.directorVersion);

        stream.seek(0);
        this.len = stream.readInt16();
        this.fileVersion = stream.readInt16();
        this.movieTop = stream.readInt16();
        this.movieLeft = stream.readInt16();
        this.movieBottom = stream.readInt16();
        this.movieRight = stream.readInt16();
        this.minMember = stream.readInt16();
        this.maxMember = stream.readInt16();
        this.field9 = stream.readInt8();
        this.field10 = stream.readInt8();

        if (ver < 700) {
            this.preD7field11 = stream.readInt16();
        } else {
            this.D7stageColorG = stream.readUint8();
            this.D7stageColorB = stream.readUint8();
        }

        this.commentFont = stream.readInt16();
        this.commentSize = stream.readInt16();
        this.commentStyle = stream.readUint16();

        if (ver < 700) {
            this.preD7stageColor = stream.readInt16();
        } else {
            this.D7stageColorIsRGB = stream.readUint8();
            this.D7stageColorR = stream.readUint8();
        }

        this.bitDepth = stream.readInt16();
        this.field17 = stream.readUint8();
        this.field18 = stream.readUint8();
        this.field19 = stream.readInt32();
        stream.readInt16(); // directorVersion already read
        this.field21 = stream.readInt16();
        this.field22 = stream.readInt32();
        this.field23 = stream.readInt32();
        this.field24 = stream.readInt32();
        this.field25 = stream.readInt8();
        this.field26 = stream.readUint8();
        this.frameRate = stream.readInt16();
        this.platform = stream.readInt16();
        this.protection = stream.readInt16();
        this.field29 = stream.readInt32();
        this.checksum = stream.readUint32();
        this.remnants = stream.readByteView(this.len - stream.pos);
    }

    unprotect() {
        this.fileVersion = this.directorVersion;
        if (this.protection % 23 === 0) {
            this.protection += 1;
        }
    }
}

/**
 * InitialMapChunk - Initial map pointing to memory map
 */
export class InitialMapChunk extends Chunk {
    constructor(dir) {
        super(dir, ChunkType.kInitialMapChunk);
        this.writable = true;
    }

    read(stream) {
        this.version = stream.readUint32();
        this.mmapOffset = stream.readUint32();
        this.directorVersion = stream.readUint32();
        this.unused1 = stream.readUint32();
        this.unused2 = stream.readUint32();
        this.unused3 = stream.readUint32();
    }
}

/**
 * KeyTableChunk - Maps chunk IDs to cast IDs
 */
export class KeyTableChunk extends Chunk {
    constructor(dir) {
        super(dir, ChunkType.kKeyTableChunk);
        this.entries = [];
    }

    read(stream) {
        this.entrySize = stream.readUint16();
        this.entrySize2 = stream.readUint16();
        this.entryCount = stream.readUint32();
        this.usedCount = stream.readUint32();

        this.entries = [];
        for (let i = 0; i < this.entryCount; i++) {
            const entry = new KeyTableEntry();
            entry.read(stream);
            this.entries.push(entry);
        }
    }
}

/**
 * MemoryMapChunk - Memory map of all chunks in file
 */
export class MemoryMapChunk extends Chunk {
    constructor(dir) {
        super(dir, ChunkType.kMemoryMapChunk);
        this.writable = true;
        this.mapArray = [];
    }

    read(stream) {
        this.headerLength = stream.readInt16();
        this.entryLength = stream.readInt16();
        this.chunkCountMax = stream.readInt32();
        this.chunkCountUsed = stream.readInt32();
        this.junkHead = stream.readInt32();
        this.junkHead2 = stream.readInt32();
        this.freeHead = stream.readInt32();

        this.mapArray = [];
        for (let i = 0; i < this.chunkCountUsed; i++) {
            const entry = new MemoryMapEntry();
            entry.read(stream);
            this.mapArray.push(entry);
        }
    }
}
