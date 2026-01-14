/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ReadStream, BufferView } from '../stream.js';
import { Endianness, FOURCC, fourCCToString } from '../lingodec/enums.js';
import {
    CastChunk, CastListChunk, CastMemberChunk, CastInfoChunk,
    ConfigChunk, InitialMapChunk, KeyTableChunk, MemoryMapChunk,
    humanVersion, MemberType, ScriptType
} from './chunk.js';
import { Script } from '../lingodec/script.js';

const kRIFXHeaderSize = 12;
const kChunkHeaderSize = 8;

/**
 * MoaID - GUID-like identifier for compression types
 */
export class MoaID {
    constructor(d1 = 0, d2 = 0, d3 = 0, d40 = 0, d41 = 0, d42 = 0, d43 = 0, d44 = 0, d45 = 0, d46 = 0, d47 = 0) {
        this.data1 = d1;
        this.data2 = d2;
        this.data3 = d3;
        this.data4 = [d40, d41, d42, d43, d44, d45, d46, d47];
    }

    read(stream) {
        this.data1 = stream.readUint32();
        this.data2 = stream.readUint16();
        this.data3 = stream.readUint16();
        for (let i = 0; i < 8; i++) {
            this.data4[i] = stream.readUint8();
        }
    }

    equals(other) {
        return this.data1 === other.data1 &&
               this.data2 === other.data2 &&
               this.data3 === other.data3 &&
               this.data4.every((v, i) => v === other.data4[i]);
    }

    toString() {
        return `${this.data1.toString(16).padStart(8, '0')}-${this.data2.toString(16).padStart(4, '0')}-${this.data3.toString(16).padStart(4, '0')}-${this.data4.map(b => b.toString(16).padStart(2, '0')).join('')}`;
    }
}

// Compression GUIDs
export const NULL_COMPRESSION_GUID = new MoaID(0xAC99982E, 0x005D, 0x0D50, 0x00, 0x00, 0x08, 0x00, 0x07, 0x37, 0x7A, 0x34);
export const ZLIB_COMPRESSION_GUID = new MoaID(0xAC99E904, 0x0070, 0x0B36, 0x00, 0x00, 0x08, 0x00, 0x07, 0x37, 0x7A, 0x34);
export const SND_COMPRESSION_GUID = new MoaID(0x7204A889, 0xAFD0, 0x11CF, 0xA2, 0x22, 0x00, 0xA0, 0x24, 0x53, 0x44, 0x4C);
export const FONTMAP_COMPRESSION_GUID = new MoaID(0x8A4679A1, 0x3720, 0x11D0, 0x92, 0x23, 0x00, 0xA0, 0xC9, 0x08, 0x68, 0xB1);

/**
 * ChunkInfo - Information about a chunk in the file
 */
export class ChunkInfo {
    constructor() {
        this.id = 0;
        this.fourCC = 0;
        this.len = 0;
        this.uncompressedLen = 0;
        this.offset = 0;
        this.compressionID = new MoaID();
    }
}

/**
 * DirectorFile - Main class for reading Director files
 */
export class DirectorFile {
    constructor() {
        this._ilsBodyOffset = 0;
        this._ilsBuf = null;
        this._cachedChunkBufs = new Map();
        this._cachedChunkViews = new Map();

        this.stream = null;
        this.keyTable = null;
        this.config = null;

        this.endianness = Endianness.kBigEndian;
        this.fverVersionString = '';
        this.version = 0;
        this.dotSyntax = false;
        this.codec = 0;
        this.afterburned = false;

        this.chunkIDsByFourCC = new Map();
        this.chunkInfo = new Map();
        this.deserializedChunks = new Map();

        this.casts = [];

        this.initialMap = null;
        this.memoryMap = null;
    }

    /**
     * Read a Director file from an ArrayBuffer
     */
    read(buffer) {
        this.stream = new ReadStream(buffer, Endianness.kBigEndian);

        // Meta
        const metaFourCC = this.stream.readUint32();
        if (metaFourCC === FOURCC('X', 'F', 'I', 'R')) {
            this.stream.endianness = Endianness.kLittleEndian;
        }
        this.endianness = this.stream.endianness;
        this.stream.readUint32(); // meta length
        this.codec = this.stream.readUint32();

        // Codec-dependent map
        if (this.codec === FOURCC('M', 'V', '9', '3') || this.codec === FOURCC('M', 'C', '9', '5')) {
            this.readMemoryMap();
        } else if (this.codec === FOURCC('F', 'G', 'D', 'M') || this.codec === FOURCC('F', 'G', 'D', 'C')) {
            this.afterburned = true;
            if (!this.readAfterburnerMap()) {
                return false;
            }
        } else {
            console.warn('Codec unsupported: ' + fourCCToString(this.codec));
            return false;
        }

        if (!this.readKeyTable()) return false;
        if (!this.readConfig()) return false;
        if (!this.readCasts()) return false;

        return true;
    }

    readMemoryMap() {
        // Initial map
        const imap = this.readChunk(FOURCC('i', 'm', 'a', 'p'));
        this.deserializedChunks.set(1, imap);

        // Memory map
        this.stream.seek(imap.mmapOffset);
        const mmap = this.readChunk(FOURCC('m', 'm', 'a', 'p'));
        this.deserializedChunks.set(2, mmap);

        for (let i = 0; i < mmap.mapArray.length; i++) {
            const mapEntry = mmap.mapArray[i];

            if (mapEntry.fourCC === FOURCC('f', 'r', 'e', 'e') || mapEntry.fourCC === FOURCC('j', 'u', 'n', 'k')) {
                continue;
            }

            const info = new ChunkInfo();
            info.id = i;
            info.fourCC = mapEntry.fourCC;
            info.len = mapEntry.len;
            info.uncompressedLen = mapEntry.len;
            info.offset = mapEntry.offset;
            info.compressionID = NULL_COMPRESSION_GUID;
            this.chunkInfo.set(i, info);

            if (!this.chunkIDsByFourCC.has(mapEntry.fourCC)) {
                this.chunkIDsByFourCC.set(mapEntry.fourCC, []);
            }
            this.chunkIDsByFourCC.get(mapEntry.fourCC).push(i);
        }
    }

    readAfterburnerMap() {
        // File version
        if (this.stream.readUint32() !== FOURCC('F', 'v', 'e', 'r')) {
            console.warn('readAfterburnerMap(): Fver expected but not found');
            return false;
        }

        const fverLength = this.stream.readVarInt();
        const fverStart = this.stream.pos;
        const fverVersion = this.stream.readVarInt();

        if (fverVersion >= 0x401) {
            this.stream.readVarInt(); // imapVersion
            this.stream.readVarInt(); // directorVersion
        }
        if (fverVersion >= 0x501) {
            const versionStringLen = this.stream.readUint8();
            this.fverVersionString = this.stream.readString(versionStringLen);
        }

        const fverEnd = this.stream.pos;
        if (fverEnd - fverStart !== fverLength) {
            this.stream.seek(fverStart + fverLength);
        }

        // Compression types
        if (this.stream.readUint32() !== FOURCC('F', 'c', 'd', 'r')) {
            console.warn('readAfterburnerMap(): Fcdr expected but not found');
            return false;
        }

        const fcdrLength = this.stream.readVarInt();
        const fcdrCompressed = this.stream.readBytes(fcdrLength);
        let fcdrBuf;
        try {
            fcdrBuf = pako.inflate(fcdrCompressed);
        } catch (e) {
            console.warn('Fcdr: Could not decompress', e);
            return false;
        }

        const fcdrStream = new ReadStream(fcdrBuf, this.endianness);
        const compressionTypeCount = fcdrStream.readUint16();
        const compressionIDs = [];
        for (let i = 0; i < compressionTypeCount; i++) {
            const id = new MoaID();
            id.read(fcdrStream);
            compressionIDs.push(id);
        }
        // Skip compression descriptions
        for (let i = 0; i < compressionTypeCount; i++) {
            fcdrStream.readCString();
        }

        // Afterburner map
        if (this.stream.readUint32() !== FOURCC('A', 'B', 'M', 'P')) {
            console.warn('readAfterburnerMap(): ABMP expected but not found');
            return false;
        }

        const abmpLength = this.stream.readVarInt();
        const abmpEnd = this.stream.pos + abmpLength;
        this.stream.readVarInt(); // compressionType
        const abmpUncompLength = this.stream.readVarInt();

        const abmpCompressed = this.stream.readBytes(abmpEnd - this.stream.pos);
        let abmpBuf;
        try {
            abmpBuf = pako.inflate(abmpCompressed);
        } catch (e) {
            console.warn('ABMP: Could not decompress', e);
            return false;
        }

        const abmpStream = new ReadStream(abmpBuf, this.endianness);
        abmpStream.readVarInt(); // unk1
        abmpStream.readVarInt(); // unk2
        const resCount = abmpStream.readVarInt();

        for (let i = 0; i < resCount; i++) {
            const resId = abmpStream.readVarInt();
            const offset = abmpStream.readVarInt();
            const compSize = abmpStream.readVarInt();
            const uncompSize = abmpStream.readVarInt();
            const compressionType = abmpStream.readVarInt();
            const tag = abmpStream.readUint32();

            const info = new ChunkInfo();
            info.id = resId;
            info.fourCC = tag;
            info.len = compSize;
            info.uncompressedLen = uncompSize;
            info.offset = offset;
            info.compressionID = compressionIDs[compressionType];
            this.chunkInfo.set(resId, info);

            if (!this.chunkIDsByFourCC.has(tag)) {
                this.chunkIDsByFourCC.set(tag, []);
            }
            this.chunkIDsByFourCC.get(tag).push(resId);
        }

        // Initial load segment
        if (!this.chunkInfo.has(2)) {
            console.warn('readAfterburnerMap(): Map has no entry for ILS');
            return false;
        }

        if (this.stream.readUint32() !== FOURCC('F', 'G', 'E', 'I')) {
            console.warn('readAfterburnerMap(): FGEI expected but not found');
            return false;
        }

        const ilsInfo = this.chunkInfo.get(2);
        this.stream.readVarInt(); // ilsUnk1
        this._ilsBodyOffset = this.stream.pos;

        const ilsCompressed = this.stream.readBytes(ilsInfo.len);
        try {
            this._ilsBuf = pako.inflate(ilsCompressed);
        } catch (e) {
            console.warn('ILS: Could not decompress', e);
            return false;
        }

        const ilsStream = new ReadStream(this._ilsBuf, this.endianness);
        while (!ilsStream.eof()) {
            const resId = ilsStream.readVarInt();
            const info = this.chunkInfo.get(resId);
            this._cachedChunkViews.set(resId, ilsStream.readByteView(info.len));
        }

        return true;
    }

    readKeyTable() {
        const info = this.getFirstChunkInfo(FOURCC('K', 'E', 'Y', '*'));
        if (info) {
            this.keyTable = this.getChunk(info.fourCC, info.id);
            return true;
        }
        console.warn('No key chunk!');
        return false;
    }

    readConfig() {
        let info = this.getFirstChunkInfo(FOURCC('D', 'R', 'C', 'F'));
        if (!info) {
            info = this.getFirstChunkInfo(FOURCC('V', 'W', 'C', 'F'));
        }

        if (info) {
            this.config = this.getChunk(info.fourCC, info.id);
            this.version = humanVersion(this.config.directorVersion);
            this.dotSyntax = (this.version >= 700);
            return true;
        }

        console.warn('No config chunk!');
        return false;
    }

    readCasts() {
        let internal = true;

        if (this.version >= 500) {
            const info = this.getFirstChunkInfo(FOURCC('M', 'C', 's', 'L'));
            if (info) {
                const castList = this.getChunk(info.fourCC, info.id);
                for (const castEntry of castList.entries) {
                    let sectionID = -1;
                    for (const keyEntry of this.keyTable.entries) {
                        if (keyEntry.castID === castEntry.id && keyEntry.fourCC === FOURCC('C', 'A', 'S', '*')) {
                            sectionID = keyEntry.sectionID;
                            break;
                        }
                    }
                    if (sectionID > 0) {
                        const cast = this.getChunk(FOURCC('C', 'A', 'S', '*'), sectionID);
                        cast.populate(castEntry.name, castEntry.id, castEntry.minMember);
                        this.casts.push(cast);
                    }
                }
                return true;
            } else {
                internal = false;
            }
        }

        const info = this.getFirstChunkInfo(FOURCC('C', 'A', 'S', '*'));
        if (info) {
            const cast = this.getChunk(info.fourCC, info.id);
            cast.populate(internal ? 'Internal' : 'External', 1024, this.config.minMember);
            this.casts.push(cast);
        }

        return true;
    }

    getFirstChunkInfo(fourCC) {
        const chunkIDs = this.chunkIDsByFourCC.get(fourCC);
        if (chunkIDs && chunkIDs.length > 0) {
            return this.chunkInfo.get(chunkIDs[0]);
        }
        return null;
    }

    chunkExists(fourCC, id) {
        if (!this.chunkInfo.has(id)) return false;
        if (fourCC !== this.chunkInfo.get(id).fourCC) return false;
        return true;
    }

    getChunk(fourCC, id) {
        if (this.deserializedChunks.has(id)) {
            return this.deserializedChunks.get(id);
        }

        const chunkView = this.getChunkData(fourCC, id);
        const chunk = this.makeChunk(fourCC, chunkView);
        this.deserializedChunks.set(id, chunk);
        return chunk;
    }

    getChunkData(fourCC, id) {
        if (!this.chunkInfo.has(id)) {
            throw new Error('Could not find chunk ' + id);
        }

        const info = this.chunkInfo.get(id);
        if (fourCC !== info.fourCC) {
            throw new Error(
                'Expected chunk ' + id + " to be '" + fourCCToString(fourCC) +
                "', but is actually '" + fourCCToString(info.fourCC) + "'"
            );
        }

        if (this._cachedChunkViews.has(id)) {
            return this._cachedChunkViews.get(id);
        }

        if (this.afterburned) {
            this.stream.seek(info.offset + this._ilsBodyOffset);

            if (info.len === 0 && info.uncompressedLen === 0) {
                this._cachedChunkViews.set(id, this.stream.readByteView(info.len));
            } else if (this.compressionImplemented(info.compressionID)) {
                if (info.compressionID.equals(ZLIB_COMPRESSION_GUID)) {
                    const compressed = this.stream.readBytes(info.len);
                    const decompressed = pako.inflate(compressed);
                    this._cachedChunkViews.set(id, new BufferView(decompressed));
                } else {
                    // SND compression not implemented for web version
                    throw new Error('SND compression not implemented');
                }
            } else if (info.compressionID.equals(NULL_COMPRESSION_GUID)) {
                this._cachedChunkViews.set(id, this.stream.readByteView(info.len));
            } else {
                console.warn('Unhandled compression type: ' + info.compressionID.toString());
                this._cachedChunkViews.set(id, this.stream.readByteView(info.len));
            }
        } else {
            this.stream.seek(info.offset);
            this._cachedChunkViews.set(id, this.readChunkData(fourCC, info.len));
        }

        return this._cachedChunkViews.get(id);
    }

    readChunk(fourCC, len = null) {
        const chunkView = this.readChunkData(fourCC, len);
        return this.makeChunk(fourCC, chunkView);
    }

    readChunkData(fourCC, len) {
        const offset = this.stream.pos;
        const validFourCC = this.stream.readUint32();
        const validLen = this.stream.readUint32();

        // use the valid length if len isn't specified
        if (len === null) {
            len = validLen;
        }

        // validate chunk
        if (fourCC !== validFourCC || len !== validLen) {
            throw new Error(
                'At offset ' + offset +
                " expected '" + fourCCToString(fourCC) + "' chunk with length " + len +
                ", but got '" + fourCCToString(validFourCC) + "' chunk with length " + validLen
            );
        }

        return this.stream.readByteView(len);
    }

    makeChunk(fourCC, view) {
        let chunk;
        switch (fourCC) {
            case FOURCC('i', 'm', 'a', 'p'):
                chunk = new InitialMapChunk(this);
                break;
            case FOURCC('m', 'm', 'a', 'p'):
                chunk = new MemoryMapChunk(this);
                break;
            case FOURCC('C', 'A', 'S', '*'):
                chunk = new CastChunk(this);
                break;
            case FOURCC('C', 'A', 'S', 't'):
                chunk = new CastMemberChunk(this);
                break;
            case FOURCC('K', 'E', 'Y', '*'):
                chunk = new KeyTableChunk(this);
                break;
            case FOURCC('L', 'c', 't', 'x'):
            case FOURCC('L', 'c', 't', 'X'):
                chunk = new ScriptContextChunk(this);
                break;
            case FOURCC('L', 'n', 'a', 'm'):
                chunk = new ScriptNamesChunk(this);
                break;
            case FOURCC('L', 's', 'c', 'r'):
                chunk = new ScriptChunk(this);
                break;
            case FOURCC('V', 'W', 'C', 'F'):
            case FOURCC('D', 'R', 'C', 'F'):
                chunk = new ConfigChunk(this);
                break;
            case FOURCC('M', 'C', 's', 'L'):
                chunk = new CastListChunk(this);
                break;
            default:
                throw new Error("Could not deserialize '" + fourCCToString(fourCC) + "' chunk");
        }

        const chunkStream = new ReadStream(view, this.endianness);
        chunk.read(chunkStream);
        return chunk;
    }

    getScript(id) {
        return this.getChunk(FOURCC('L', 's', 'c', 'r'), id);
    }

    getScriptNames(id) {
        return this.getChunk(FOURCC('L', 'n', 'a', 'm'), id);
    }

    compressionImplemented(compressionID) {
        return compressionID.equals(ZLIB_COMPRESSION_GUID);
        // SND compression not implemented for web version
    }

    /**
     * Parse all scripts in the file
     */
    parseScripts() {
        for (const cast of this.casts) {
            if (!cast.lctx) continue;
            cast.lctx.parseScripts();
        }
    }

    /**
     * Restore script text for all scripts
     */
    restoreScriptText() {
        for (const cast of this.casts) {
            if (!cast.lctx) continue;

            for (const [scriptId, script] of cast.lctx.scripts) {
                const member = script.member;
                if (member) {
                    member.setScriptText(script.scriptText('\r', this.dotSyntax));
                }
            }
        }
    }

    /**
     * Get all scripts as an array of {name, type, content} objects
     */
    getScripts() {
        const scripts = [];

        for (const cast of this.casts) {
            if (!cast.lctx) continue;

            for (const [scriptId, script] of cast.lctx.scripts) {
                const member = script.member;
                if (!member) continue;

                let scriptType = 'Script';
                if (member.type === MemberType.kScriptMember && member.scriptType !== undefined) {
                    switch (member.scriptType) {
                        case ScriptType.kScoreScript:
                            scriptType = (this.version >= 600) ? 'BehaviorScript' : 'ScoreScript';
                            break;
                        case ScriptType.kMovieScript:
                            scriptType = 'MovieScript';
                            break;
                        case ScriptType.kParentScript:
                            scriptType = 'ParentScript';
                            break;
                        default:
                            scriptType = 'UnknownScript';
                            break;
                    }
                } else {
                    scriptType = 'CastScript';
                }

                let name = scriptType + ' ' + member.id;
                if (member.getName()) {
                    name += ' - ' + member.getName();
                }

                scripts.push({
                    name: name,
                    type: scriptType,
                    castName: cast.name,
                    memberId: member.id,
                    memberName: member.getName(),
                    content: script.scriptText('\n', this.dotSyntax),
                    bytecode: script.bytecodeText('\n', this.dotSyntax)
                });
            }
        }

        return scripts;
    }

    isCast() {
        return this.codec === FOURCC('M', 'C', '9', '5') || this.codec === FOURCC('F', 'G', 'D', 'C');
    }

    /**
     * Get all script chunks from all casts
     */
    get scriptChunks() {
        const chunks = [];
        for (const cast of this.casts) {
            if (!cast.lctx) continue;
            for (const [scriptId, script] of cast.lctx.scripts) {
                chunks.push(script);
            }
        }
        return chunks;
    }
}

// Import script-related chunks (these will be implemented in script.js)
// For now, define placeholder classes
export class ScriptContextChunk {
    constructor(dir) {
        this.dir = dir;
        this.scripts = new Map();
        this.lnam = null;
    }

    read(stream) {
        // Will be implemented when we add script.js
        stream.endianness = Endianness.kBigEndian;

        this.unknown0 = stream.readInt32();
        this.unknown1 = stream.readInt32();
        this.entryCount = stream.readUint32();
        this.entryCount2 = stream.readUint32();
        this.entriesOffset = stream.readUint16();
        this.unknown2 = stream.readInt16();
        this.unknown3 = stream.readInt32();
        this.unknown4 = stream.readInt32();
        this.unknown5 = stream.readInt32();
        this.lnamSectionID = stream.readInt32();
        this.validCount = stream.readUint16();
        this.flags = stream.readUint16();
        this.freePointer = stream.readInt16();

        // Read section map
        stream.seek(this.entriesOffset);
        this.sectionMap = [];
        for (let i = 0; i < this.entryCount; i++) {
            const entry = {
                unknown0: stream.readInt32(),
                sectionID: stream.readInt32(),
                unknown1: stream.readUint16(),
                unknown2: stream.readUint16()
            };
            this.sectionMap.push(entry);
        }

        // Get lnam
        if (this.lnamSectionID >= 0 && this.dir.chunkExists(FOURCC('L', 'n', 'a', 'm'), this.lnamSectionID)) {
            this.lnam = this.dir.getChunk(FOURCC('L', 'n', 'a', 'm'), this.lnamSectionID);
        }

        // Load scripts
        for (const entry of this.sectionMap) {
            if (entry.sectionID >= 0 && this.dir.chunkExists(FOURCC('L', 's', 'c', 'r'), entry.sectionID)) {
                const script = this.dir.getChunk(FOURCC('L', 's', 'c', 'r'), entry.sectionID);
                script.setContext(this);
                this.scripts.set(script.scriptNumber, script);
            }
        }
    }

    parseScripts() {
        for (const [id, script] of this.scripts) {
            script.parse();
        }
    }

    validName(id) {
        return this.lnam && this.lnam.validName(id);
    }

    getName(id) {
        if (this.lnam) {
            return this.lnam.getName(id);
        }
        return 'UNKNOWN_NAME_' + id;
    }
}

export class ScriptNamesChunk {
    constructor(dir) {
        this.dir = dir;
        this.version = dir.version;
        this.names = [];
    }

    read(stream) {
        stream.endianness = Endianness.kBigEndian;

        this.unknown0 = stream.readInt32();
        this.unknown1 = stream.readInt32();
        this.len1 = stream.readUint32();
        this.len2 = stream.readUint32();
        this.namesOffset = stream.readUint16();
        this.namesCount = stream.readUint16();

        stream.seek(this.namesOffset);
        this.names = [];
        for (let i = 0; i < this.namesCount; i++) {
            const length = stream.readUint8();
            this.names.push(stream.readString(length));
        }
    }

    validName(id) {
        return id >= 0 && id < this.names.length;
    }

    getName(id) {
        if (this.validName(id)) {
            return this.names[id];
        }
        return 'UNKNOWN_NAME_' + id;
    }
}

/**
 * ScriptChunk - Wrapper for Lingo script data
 */
export class ScriptChunk {
    constructor(dir) {
        this.dir = dir;
        this.version = dir.version;
        this.member = null;
        this.context = null;
        this.script = new Script(dir.version);
    }

    read(stream) {
        this.script.read(stream);
    }

    setContext(ctx) {
        this.context = ctx;
        this.script.setContext(ctx);
    }

    parse() {
        this.script.parse();
    }

    get scriptNumber() {
        return this.script.scriptNumber;
    }

    get handlers() {
        return this.script.handlers;
    }

    get factoryName() {
        return this.script.factoryName;
    }

    get scriptFlags() {
        return this.script.scriptFlags;
    }

    isFactory() {
        return this.script.isFactory();
    }

    scriptText(lineEnding, dotSyntax) {
        return this.script.scriptText(lineEnding, dotSyntax);
    }

    bytecodeText(lineEnding, dotSyntax) {
        return this.script.bytecodeText(lineEnding, dotSyntax);
    }
}
