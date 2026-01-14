/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { LiteralType, ScriptFlag } from './enums.js';
import { Endianness } from './enums.js';
import { Datum, CodeWriter } from './ast.js';
import { Handler } from './handler.js';

/**
 * LiteralStore - Stores a literal value from the script
 */
export class LiteralStore {
    constructor() {
        this.type = LiteralType.kLiteralString;
        this.offset = 0;
        this.value = null;
    }

    readRecord(stream, version) {
        if (version >= 500) {
            this.type = stream.readUint32();
        } else {
            this.type = stream.readUint16();
        }
        this.offset = stream.readUint32();
    }

    readData(stream, startOffset) {
        if (this.type === LiteralType.kLiteralInt) {
            this.value = Datum.fromInt(this.offset);
        } else {
            stream.seek(startOffset + this.offset);
            const length = stream.readUint32();
            if (this.type === LiteralType.kLiteralString) {
                this.value = Datum.fromString(stream.readString(length - 1));
            } else if (this.type === LiteralType.kLiteralFloat) {
                let floatVal = 0.0;
                if (length === 8) {
                    floatVal = stream.readDouble();
                } else if (length === 10) {
                    floatVal = stream.readAppleFloat80();
                }
                this.value = Datum.fromFloat(floatVal);
            } else {
                this.value = new Datum();
            }
        }
    }
}

/**
 * Script - Represents a Lingo script
 */
export class Script {
    constructor(version) {
        this.version = version;
        this.context = null;

        this.totalLength = 0;
        this.totalLength2 = 0;
        this.headerLength = 0;
        this.scriptNumber = 0;
        this.unk20 = 0;
        this.parentNumber = 0;

        this.scriptFlags = 0;
        this.unk42 = 0;
        this.castID = 0;
        this.factoryNameID = 0;
        this.handlerVectorsCount = 0;
        this.handlerVectorsOffset = 0;
        this.handlerVectorsSize = 0;
        this.propertiesCount = 0;
        this.propertiesOffset = 0;
        this.globalsCount = 0;
        this.globalsOffset = 0;
        this.handlersCount = 0;
        this.handlersOffset = 0;
        this.literalsCount = 0;
        this.literalsOffset = 0;
        this.literalsDataCount = 0;
        this.literalsDataOffset = 0;

        this.propertyNameIDs = [];
        this.globalNameIDs = [];

        this.factoryName = '';
        this.propertyNames = [];
        this.globalNames = [];
        this.handlers = [];
        this.literals = [];
        this.factories = [];
    }

    read(stream) {
        // Lingo scripts are always big endian regardless of file endianness
        stream.endianness = Endianness.kBigEndian;

        stream.seek(8);
        this.totalLength = stream.readUint32();
        this.totalLength2 = stream.readUint32();
        this.headerLength = stream.readUint16();
        this.scriptNumber = stream.readUint16();
        this.unk20 = stream.readInt16();
        this.parentNumber = stream.readInt16();

        stream.seek(38);
        this.scriptFlags = stream.readUint32();
        this.unk42 = stream.readInt16();
        this.castID = stream.readInt32();
        this.factoryNameID = stream.readInt16();
        this.handlerVectorsCount = stream.readUint16();
        this.handlerVectorsOffset = stream.readUint32();
        this.handlerVectorsSize = stream.readUint32();
        this.propertiesCount = stream.readUint16();
        this.propertiesOffset = stream.readUint32();
        this.globalsCount = stream.readUint16();
        this.globalsOffset = stream.readUint32();
        this.handlersCount = stream.readUint16();
        this.handlersOffset = stream.readUint32();
        this.literalsCount = stream.readUint16();
        this.literalsOffset = stream.readUint32();
        this.literalsDataCount = stream.readUint32();
        this.literalsDataOffset = stream.readUint32();

        this.propertyNameIDs = this.readVarnamesTable(stream, this.propertiesCount, this.propertiesOffset);
        this.globalNameIDs = this.readVarnamesTable(stream, this.globalsCount, this.globalsOffset);

        this.handlers = [];
        for (let i = 0; i < this.handlersCount; i++) {
            this.handlers.push(new Handler(this));
        }

        if ((this.scriptFlags & ScriptFlag.kScriptFlagEventScript) && this.handlersCount > 0) {
            this.handlers[0].isGenericEvent = true;
        }

        stream.seek(this.handlersOffset);
        for (const handler of this.handlers) {
            handler.readRecord(stream);
        }
        for (const handler of this.handlers) {
            handler.readData(stream);
        }

        stream.seek(this.literalsOffset);
        this.literals = [];
        for (let i = 0; i < this.literalsCount; i++) {
            const literal = new LiteralStore();
            literal.readRecord(stream, this.version);
            this.literals.push(literal);
        }
        for (const literal of this.literals) {
            literal.readData(stream, this.literalsDataOffset);
        }
    }

    readVarnamesTable(stream, count, offset) {
        stream.seek(offset);
        const nameIDs = [];
        for (let i = 0; i < count; i++) {
            nameIDs.push(stream.readInt16());
        }
        return nameIDs;
    }

    validName(id) {
        return this.context.validName(id);
    }

    getName(id) {
        return this.context.getName(id);
    }

    setContext(ctx) {
        this.context = ctx;
        if (this.factoryNameID !== -1) {
            this.factoryName = this.getName(this.factoryNameID);
        }
        for (const nameID of this.propertyNameIDs) {
            if (this.validName(nameID)) {
                const name = this.getName(nameID);
                if (this.isFactory() && name === 'me') {
                    continue;
                }
                this.propertyNames.push(name);
            }
        }
        for (const nameID of this.globalNameIDs) {
            if (this.validName(nameID)) {
                this.globalNames.push(this.getName(nameID));
            }
        }
        for (const handler of this.handlers) {
            handler.readNames();
        }
    }

    parse() {
        for (const handler of this.handlers) {
            handler.parse();
        }
    }

    writeVarDeclarations(code) {
        if (!this.isFactory()) {
            if (this.propertyNames.length > 0) {
                code.write('property ');
                for (let i = 0; i < this.propertyNames.length; i++) {
                    if (i > 0) code.write(', ');
                    code.write(this.propertyNames[i]);
                }
                code.writeLine();
            }
        }
        if (this.globalNames.length > 0) {
            code.write('global ');
            for (let i = 0; i < this.globalNames.length; i++) {
                if (i > 0) code.write(', ');
                code.write(this.globalNames[i]);
            }
            code.writeLine();
        }
    }

    writeScriptText(code, dotSyntax) {
        const origSize = code.size;
        this.writeVarDeclarations(code);
        if (this.isFactory()) {
            if (code.size !== origSize) {
                code.writeLine();
            }
            code.write('factory ');
            code.writeLine(this.factoryName);
        }
        for (let i = 0; i < this.handlers.length; i++) {
            if ((!this.isFactory() || i > 0) && code.size !== origSize) {
                code.writeLine();
            }
            this.handlers[i].ast.writeScriptText(code, dotSyntax, false);
        }
        for (const factory of this.factories) {
            if (code.size !== origSize) {
                code.writeLine();
            }
            factory.writeScriptText(code, dotSyntax);
        }
    }

    scriptText(lineEnding = '\n', dotSyntax = false) {
        const code = new CodeWriter(lineEnding);
        this.writeScriptText(code, dotSyntax);
        return code.str();
    }

    writeBytecodeText(code, dotSyntax) {
        const origSize = code.size;
        this.writeVarDeclarations(code);
        if (this.isFactory()) {
            if (code.size !== origSize) {
                code.writeLine();
            }
            code.write('factory ');
            code.writeLine(this.factoryName);
        }
        for (let i = 0; i < this.handlers.length; i++) {
            if ((!this.isFactory() || i > 0) && code.size !== origSize) {
                code.writeLine();
            }
            this.handlers[i].writeBytecodeText(code, dotSyntax);
        }
        for (const factory of this.factories) {
            if (code.size !== origSize) {
                code.writeLine();
            }
            factory.writeBytecodeText(code, dotSyntax);
        }
    }

    bytecodeText(lineEnding = '\n', dotSyntax = false) {
        const code = new CodeWriter(lineEnding);
        this.writeBytecodeText(code, dotSyntax);
        return code.str();
    }

    isFactory() {
        return (this.scriptFlags & ScriptFlag.kScriptFlagFactoryDef) !== 0;
    }
}

/**
 * ScriptContextMapEntry - Entry in the script context map
 */
export class ScriptContextMapEntry {
    constructor() {
        this.unknown0 = 0;
        this.sectionID = 0;
        this.unknown1 = 0;
        this.unknown2 = 0;
    }

    read(stream) {
        this.unknown0 = stream.readInt32();
        this.sectionID = stream.readInt32();
        this.unknown1 = stream.readUint16();
        this.unknown2 = stream.readUint16();
    }
}

/**
 * ScriptContext - Context for script name resolution
 */
export class ScriptContext {
    constructor(version, resolver) {
        this.version = version;
        this.resolver = resolver;
        this.lnam = null;

        this.unknown0 = 0;
        this.unknown1 = 0;
        this.entryCount = 0;
        this.entryCount2 = 0;
        this.entriesOffset = 0;
        this.unknown2 = 0;
        this.unknown3 = 0;
        this.unknown4 = 0;
        this.unknown5 = 0;
        this.lnamSectionID = 0;
        this.validCount = 0;
        this.flags = 0;
        this.freePointer = 0;

        this.sectionMap = [];
        this.scripts = new Map();
    }

    read(stream) {
        // Script context is always big endian
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

        stream.seek(this.entriesOffset);
        this.sectionMap = [];
        for (let i = 0; i < this.entryCount; i++) {
            const entry = new ScriptContextMapEntry();
            entry.read(stream);
            this.sectionMap.push(entry);
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

    parseScripts() {
        for (const [id, script] of this.scripts) {
            script.parse();
        }
    }
}
