/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { fourCCToString } from '../lingodec/enums.js';

/**
 * CastListEntry - Entry in the cast list
 */
export class CastListEntry {
    constructor() {
        this.name = '';
        this.filePath = '';
        this.preloadSettings = 0;
        this.minMember = 0;
        this.maxMember = 0;
        this.id = 0;
    }

    toJSON() {
        return {
            name: this.name,
            filePath: this.filePath,
            preloadSettings: this.preloadSettings,
            minMember: this.minMember,
            maxMember: this.maxMember,
            id: this.id
        };
    }
}

/**
 * MemoryMapEntry - Entry in the memory map
 */
export class MemoryMapEntry {
    constructor() {
        this.fourCC = 0;
        this.len = 0;
        this.offset = 0;
        this.flags = 0;
        this.unknown0 = 0;
        this.next = 0;
    }

    read(stream) {
        this.fourCC = stream.readUint32();
        this.len = stream.readUint32();
        this.offset = stream.readUint32();
        this.flags = stream.readInt16();
        this.unknown0 = stream.readInt16();
        this.next = stream.readInt32();
    }

    write(stream) {
        stream.writeUint32(this.fourCC);
        stream.writeUint32(this.len);
        stream.writeUint32(this.offset);
        stream.writeInt16(this.flags);
        stream.writeInt16(this.unknown0);
        stream.writeInt32(this.next);
    }

    toJSON() {
        return {
            fourCC: fourCCToString(this.fourCC),
            len: this.len,
            offset: this.offset,
            flags: this.flags,
            unknown0: this.unknown0,
            next: this.next
        };
    }
}

/**
 * KeyTableEntry - Entry in the key table
 */
export class KeyTableEntry {
    constructor() {
        this.sectionID = 0;
        this.castID = 0;
        this.fourCC = 0;
    }

    read(stream) {
        this.sectionID = stream.readInt32();
        this.castID = stream.readInt32();
        this.fourCC = stream.readUint32();
    }

    toJSON() {
        return {
            sectionID: this.sectionID,
            castID: this.castID,
            fourCC: fourCCToString(this.fourCC)
        };
    }
}
