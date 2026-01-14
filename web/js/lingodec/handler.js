/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    OpCode, DatumType, NodeType, ChunkExprType, PutType,
    BytecodeTag, CaseExpect
} from './enums.js';
import { StandardNames } from './names.js';
import {
    AST, Datum, CodeWriter, BlockNode,
    ErrorNode, CommentNode, LiteralNode, VarNode,
    BinaryOpNode, InverseOpNode, NotOpNode,
    ChunkExprNode, ChunkHiliteStmtNode, ChunkDeleteStmtNode,
    SpriteIntersectsExprNode, SpriteWithinExprNode,
    MemberExprNode, TellStmtNode,
    ExitStmtNode, AssignmentStmtNode,
    IfStmtNode, RepeatWhileStmtNode, RepeatWithInStmtNode, RepeatWithToStmtNode,
    CaseLabelNode, CaseStmtNode, EndCaseNode,
    ExitRepeatStmtNode, NextRepeatStmtNode,
    PutStmtNode, WhenStmtNode,
    CallNode, ObjCallNode, ObjCallV4Node,
    TheExprNode, LastStringChunkExprNode, StringChunkCountExprNode,
    MenuPropExprNode, MenuItemPropExprNode, SoundPropExprNode, SpritePropExprNode,
    ThePropExprNode, ObjPropExprNode, ObjBracketExprNode, ObjPropIndexExprNode,
    SoundCmdStmtNode, PlayCmdStmtNode, NewObjNode
} from './ast.js';

/**
 * Bytecode - Single bytecode instruction
 */
export class Bytecode {
    constructor(op, obj, pos) {
        this.opID = op;
        this.obj = obj;
        this.pos = pos;
        this.tag = BytecodeTag.kTagNone;
        this.ownerLoop = 0xFFFFFFFF;
        this.translation = null;
        // Calculate opcode
        this.opcode = op >= 0x40 ? 0x40 + (op % 0x40) : op;
    }
}

/**
 * Handler - Represents a Lingo handler/function
 */
export class Handler {
    constructor(script) {
        this.script = script;
        this.nameID = 0;
        this.vectorPos = 0;
        this.compiledLen = 0;
        this.compiledOffset = 0;
        this.argumentCount = 0;
        this.argumentOffset = 0;
        this.localsCount = 0;
        this.localsOffset = 0;
        this.globalsCount = 0;
        this.globalsOffset = 0;
        this.unknown1 = 0;
        this.unknown2 = 0;
        this.lineCount = 0;
        this.lineOffset = 0;
        this.stackHeight = 0;

        this.argumentNameIDs = [];
        this.localNameIDs = [];
        this.globalNameIDs = [];

        this.bytecodeArray = [];
        this.bytecodePosMap = new Map();
        this.argumentNames = [];
        this.localNames = [];
        this.globalNames = [];
        this.name = '';

        this.stack = [];
        this.ast = null;

        this.isGenericEvent = false;
    }

    readRecord(stream) {
        this.nameID = stream.readInt16();
        this.vectorPos = stream.readUint16();
        this.compiledLen = stream.readUint32();
        this.compiledOffset = stream.readUint32();
        this.argumentCount = stream.readUint16();
        this.argumentOffset = stream.readUint32();
        this.localsCount = stream.readUint16();
        this.localsOffset = stream.readUint32();
        this.globalsCount = stream.readUint16();
        this.globalsOffset = stream.readUint32();
        this.unknown1 = stream.readUint32();
        this.unknown2 = stream.readUint16();
        this.lineCount = stream.readUint16();
        this.lineOffset = stream.readUint32();
        if (this.script.version >= 850) {
            this.stackHeight = stream.readUint32();
        }
    }

    readData(stream) {
        stream.seek(this.compiledOffset);
        while (stream.pos < this.compiledOffset + this.compiledLen) {
            const pos = stream.pos - this.compiledOffset;
            const op = stream.readUint8();
            const opcode = op >= 0x40 ? 0x40 + (op % 0x40) : op;

            let obj = 0;
            if (op >= 0xc0) {
                // four bytes
                obj = stream.readInt32();
            } else if (op >= 0x80) {
                // two bytes
                if (opcode === OpCode.kOpPushInt16 || opcode === OpCode.kOpPushInt8) {
                    obj = stream.readInt16();
                } else {
                    obj = stream.readUint16();
                }
            } else if (op >= 0x40) {
                // one byte
                if (opcode === OpCode.kOpPushInt8) {
                    obj = stream.readInt8();
                } else {
                    obj = stream.readUint8();
                }
            }

            const bytecode = new Bytecode(op, obj, pos);
            this.bytecodeArray.push(bytecode);
            this.bytecodePosMap.set(pos, this.bytecodeArray.length - 1);
        }

        this.argumentNameIDs = this.readVarnamesTable(stream, this.argumentCount, this.argumentOffset);
        this.localNameIDs = this.readVarnamesTable(stream, this.localsCount, this.localsOffset);
        this.globalNameIDs = this.readVarnamesTable(stream, this.globalsCount, this.globalsOffset);
    }

    readVarnamesTable(stream, count, offset) {
        stream.seek(offset);
        const nameIDs = [];
        for (let i = 0; i < count; i++) {
            nameIDs.push(stream.readUint16());
        }
        return nameIDs;
    }

    readNames() {
        if (!this.isGenericEvent) {
            this.name = this.getName(this.nameID);
        }
        for (let i = 0; i < this.argumentNameIDs.length; i++) {
            if (i === 0 && this.script.isFactory()) {
                continue;
            }
            this.argumentNames.push(this.getName(this.argumentNameIDs[i]));
        }
        for (const nameID of this.localNameIDs) {
            if (this.validName(nameID)) {
                this.localNames.push(this.getName(nameID));
            }
        }
        for (const nameID of this.globalNameIDs) {
            if (this.validName(nameID)) {
                this.globalNames.push(this.getName(nameID));
            }
        }
    }

    validName(id) {
        return this.script.validName(id);
    }

    getName(id) {
        return this.script.getName(id);
    }

    getArgumentName(id) {
        if (id >= 0 && id < this.argumentNameIDs.length) {
            return this.getName(this.argumentNameIDs[id]);
        }
        return 'UNKNOWN_ARG_' + id;
    }

    getLocalName(id) {
        if (id >= 0 && id < this.localNameIDs.length) {
            return this.getName(this.localNameIDs[id]);
        }
        return 'UNKNOWN_LOCAL_' + id;
    }

    pop() {
        if (this.stack.length === 0) {
            return new ErrorNode();
        }
        return this.stack.pop();
    }

    variableMultiplier() {
        if (this.script.version >= 850) return 1;
        if (this.script.version >= 500) return 8;
        return 6;
    }

    readVar(varType) {
        let castID = null;
        if (varType === 0x6 && this.script.version >= 500) {
            castID = this.pop();
        }
        const id = this.pop();

        switch (varType) {
            case 0x1: // global
            case 0x2: // global
            case 0x3: // property/instance
                return id;
            case 0x4: // arg
                {
                    const name = this.getArgumentName(Math.floor(id.getValue().i / this.variableMultiplier()));
                    const ref = Datum.fromVarRef(name);
                    return new LiteralNode(ref);
                }
            case 0x5: // local
                {
                    const name = this.getLocalName(Math.floor(id.getValue().i / this.variableMultiplier()));
                    const ref = Datum.fromVarRef(name);
                    return new LiteralNode(ref);
                }
            case 0x6: // field
                return new MemberExprNode('field', id, castID);
            default:
                console.warn('readVar: unhandled var type', varType);
                break;
        }
        return new ErrorNode();
    }

    getVarNameFromSet(bytecode) {
        switch (bytecode.opcode) {
            case OpCode.kOpSetGlobal:
            case OpCode.kOpSetGlobal2:
                return this.getName(bytecode.obj);
            case OpCode.kOpSetProp:
                return this.getName(bytecode.obj);
            case OpCode.kOpSetParam:
                return this.getArgumentName(Math.floor(bytecode.obj / this.variableMultiplier()));
            case OpCode.kOpSetLocal:
                return this.getLocalName(Math.floor(bytecode.obj / this.variableMultiplier()));
            default:
                return 'ERROR';
        }
    }

    readV4Property(propertyType, propertyID) {
        switch (propertyType) {
            case 0x00:
                if (propertyID <= 0x0b) {
                    const propName = StandardNames.getName(StandardNames.moviePropertyNames, propertyID);
                    return new TheExprNode(propName);
                } else {
                    const string = this.pop();
                    const chunkType = propertyID - 0x0b;
                    return new LastStringChunkExprNode(chunkType, string);
                }
            case 0x01:
                {
                    const string = this.pop();
                    return new StringChunkCountExprNode(propertyID, string);
                }
            case 0x02:
                {
                    const menuID = this.pop();
                    return new MenuPropExprNode(menuID, propertyID);
                }
            case 0x03:
                {
                    const menuID = this.pop();
                    const itemID = this.pop();
                    return new MenuItemPropExprNode(menuID, itemID, propertyID);
                }
            case 0x04:
                {
                    const soundID = this.pop();
                    return new SoundPropExprNode(soundID, propertyID);
                }
            case 0x05:
                return new CommentNode('ERROR: Resource property');
            case 0x06:
                {
                    const spriteID = this.pop();
                    return new SpritePropExprNode(spriteID, propertyID);
                }
            case 0x07:
                return new TheExprNode(StandardNames.getName(StandardNames.animationPropertyNames, propertyID));
            case 0x08:
                if (propertyID === 0x02 && this.script.version >= 500) {
                    const castLib = this.pop();
                    if (!(castLib.type === NodeType.kLiteralNode &&
                          castLib.getValue().type === DatumType.kDatumInt &&
                          castLib.getValue().toInt() === 0)) {
                        const castLibNode = new MemberExprNode('castLib', castLib, null);
                        return new ThePropExprNode(castLibNode, StandardNames.getName(StandardNames.animation2PropertyNames, propertyID));
                    }
                }
                return new TheExprNode(StandardNames.getName(StandardNames.animation2PropertyNames, propertyID));
            case 0x09:
            case 0x0a:
            case 0x0b:
            case 0x0c:
            case 0x0d:
            case 0x0e:
            case 0x0f:
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
                {
                    const propName = StandardNames.getName(StandardNames.memberPropertyNames, propertyID);
                    let castID = null;
                    if (this.script.version >= 500) {
                        castID = this.pop();
                    }
                    const memberID = this.pop();
                    let prefix;
                    if (propertyType === 0x0b || propertyType === 0x0c) {
                        prefix = 'field';
                    } else if (propertyType === 0x14 || propertyType === 0x15) {
                        prefix = 'script';
                    } else {
                        prefix = (this.script.version >= 500) ? 'member' : 'cast';
                    }
                    const member = new MemberExprNode(prefix, memberID, castID);
                    let entity;
                    if (propertyType === 0x0a || propertyType === 0x0c || propertyType === 0x15) {
                        entity = this.readChunkRef(member);
                    } else {
                        entity = member;
                    }
                    return new ThePropExprNode(entity, propName);
                }
            default:
                break;
        }
        return new CommentNode('ERROR: Unknown property type ' + propertyType);
    }

    readChunkRef(string) {
        const lastLine = this.pop();
        const firstLine = this.pop();
        const lastItem = this.pop();
        const firstItem = this.pop();
        const lastWord = this.pop();
        const firstWord = this.pop();
        const lastChar = this.pop();
        const firstChar = this.pop();

        const isZero = (node) => {
            return node.type === NodeType.kLiteralNode &&
                   node.getValue().type === DatumType.kDatumInt &&
                   node.getValue().toInt() === 0;
        };

        if (!isZero(firstLine)) {
            string = new ChunkExprNode(ChunkExprType.kChunkLine, firstLine, lastLine, string);
        }
        if (!isZero(firstItem)) {
            string = new ChunkExprNode(ChunkExprType.kChunkItem, firstItem, lastItem, string);
        }
        if (!isZero(firstWord)) {
            string = new ChunkExprNode(ChunkExprType.kChunkWord, firstWord, lastWord, string);
        }
        if (!isZero(firstChar)) {
            string = new ChunkExprNode(ChunkExprType.kChunkChar, firstChar, lastChar, string);
        }

        return string;
    }

    tagLoops() {
        for (let startIndex = 0; startIndex < this.bytecodeArray.length; startIndex++) {
            const jmpifz = this.bytecodeArray[startIndex];
            if (jmpifz.opcode !== OpCode.kOpJmpIfZ) continue;

            const jmpPos = jmpifz.pos + jmpifz.obj;
            const endIndex = this.bytecodePosMap.get(jmpPos);
            if (endIndex === undefined) continue;

            const endRepeat = this.bytecodeArray[endIndex - 1];
            if (!endRepeat || endRepeat.opcode !== OpCode.kOpEndRepeat || (endRepeat.pos - endRepeat.obj) > jmpifz.pos) {
                continue;
            }

            const loopType = this.identifyLoop(startIndex, endIndex);
            this.bytecodeArray[startIndex].tag = loopType;

            if (loopType === BytecodeTag.kTagRepeatWithIn) {
                for (let i = startIndex - 7; i <= startIndex - 1; i++) {
                    if (i >= 0) this.bytecodeArray[i].tag = BytecodeTag.kTagSkip;
                }
                for (let i = startIndex + 1; i <= startIndex + 5; i++) {
                    if (i < this.bytecodeArray.length) this.bytecodeArray[i].tag = BytecodeTag.kTagSkip;
                }
                if (endIndex >= 3) {
                    this.bytecodeArray[endIndex - 3].tag = BytecodeTag.kTagNextRepeatTarget;
                    this.bytecodeArray[endIndex - 3].ownerLoop = startIndex;
                }
                if (endIndex >= 2) this.bytecodeArray[endIndex - 2].tag = BytecodeTag.kTagSkip;
                if (endIndex >= 1) {
                    this.bytecodeArray[endIndex - 1].tag = BytecodeTag.kTagSkip;
                    this.bytecodeArray[endIndex - 1].ownerLoop = startIndex;
                }
                if (endIndex < this.bytecodeArray.length) this.bytecodeArray[endIndex].tag = BytecodeTag.kTagSkip;
            } else if (loopType === BytecodeTag.kTagRepeatWithTo || loopType === BytecodeTag.kTagRepeatWithDownTo) {
                const conditionStartIndex = this.bytecodePosMap.get(endRepeat.pos - endRepeat.obj);
                if (conditionStartIndex !== undefined && conditionStartIndex >= 1) {
                    this.bytecodeArray[conditionStartIndex - 1].tag = BytecodeTag.kTagSkip;
                    this.bytecodeArray[conditionStartIndex].tag = BytecodeTag.kTagSkip;
                }
                if (startIndex >= 1) this.bytecodeArray[startIndex - 1].tag = BytecodeTag.kTagSkip;
                if (endIndex >= 5) {
                    this.bytecodeArray[endIndex - 5].tag = BytecodeTag.kTagNextRepeatTarget;
                    this.bytecodeArray[endIndex - 5].ownerLoop = startIndex;
                }
                if (endIndex >= 4) this.bytecodeArray[endIndex - 4].tag = BytecodeTag.kTagSkip;
                if (endIndex >= 3) this.bytecodeArray[endIndex - 3].tag = BytecodeTag.kTagSkip;
                if (endIndex >= 2) this.bytecodeArray[endIndex - 2].tag = BytecodeTag.kTagSkip;
                if (endIndex >= 1) {
                    this.bytecodeArray[endIndex - 1].tag = BytecodeTag.kTagSkip;
                    this.bytecodeArray[endIndex - 1].ownerLoop = startIndex;
                }
            } else if (loopType === BytecodeTag.kTagRepeatWhile) {
                if (endIndex >= 1) {
                    this.bytecodeArray[endIndex - 1].tag = BytecodeTag.kTagNextRepeatTarget;
                    this.bytecodeArray[endIndex - 1].ownerLoop = startIndex;
                }
            }
        }
    }

    isRepeatWithIn(startIndex, endIndex) {
        if (startIndex < 7 || startIndex > this.bytecodeArray.length - 6) return false;

        const bc = this.bytecodeArray;
        if (!(bc[startIndex - 7].opcode === OpCode.kOpPeek && bc[startIndex - 7].obj === 0)) return false;
        if (!(bc[startIndex - 6].opcode === OpCode.kOpPushArgList && bc[startIndex - 6].obj === 1)) return false;
        if (!(bc[startIndex - 5].opcode === OpCode.kOpExtCall && this.getName(bc[startIndex - 5].obj) === 'count')) return false;
        if (!(bc[startIndex - 4].opcode === OpCode.kOpPushInt8 && bc[startIndex - 4].obj === 1)) return false;
        if (!(bc[startIndex - 3].opcode === OpCode.kOpPeek && bc[startIndex - 3].obj === 0)) return false;
        if (!(bc[startIndex - 2].opcode === OpCode.kOpPeek && bc[startIndex - 2].obj === 2)) return false;
        if (!(bc[startIndex - 1].opcode === OpCode.kOpLtEq)) return false;
        if (!(bc[startIndex + 1].opcode === OpCode.kOpPeek && bc[startIndex + 1].obj === 2)) return false;
        if (!(bc[startIndex + 2].opcode === OpCode.kOpPeek && bc[startIndex + 2].obj === 1)) return false;
        if (!(bc[startIndex + 3].opcode === OpCode.kOpPushArgList && bc[startIndex + 3].obj === 2)) return false;
        if (!(bc[startIndex + 4].opcode === OpCode.kOpExtCall && this.getName(bc[startIndex + 4].obj) === 'getAt')) return false;
        if (!(bc[startIndex + 5].opcode === OpCode.kOpSetGlobal ||
              bc[startIndex + 5].opcode === OpCode.kOpSetProp ||
              bc[startIndex + 5].opcode === OpCode.kOpSetParam ||
              bc[startIndex + 5].opcode === OpCode.kOpSetLocal)) return false;

        if (endIndex < 3) return false;
        if (!(bc[endIndex - 3].opcode === OpCode.kOpPushInt8 && bc[endIndex - 3].obj === 1)) return false;
        if (!(bc[endIndex - 2].opcode === OpCode.kOpAdd)) return false;
        if (!(bc[endIndex].opcode === OpCode.kOpPop && bc[endIndex].obj === 3)) return false;

        return true;
    }

    identifyLoop(startIndex, endIndex) {
        if (this.isRepeatWithIn(startIndex, endIndex)) {
            return BytecodeTag.kTagRepeatWithIn;
        }

        if (startIndex < 1) return BytecodeTag.kTagRepeatWhile;

        let up;
        switch (this.bytecodeArray[startIndex - 1].opcode) {
            case OpCode.kOpLtEq:
                up = true;
                break;
            case OpCode.kOpGtEq:
                up = false;
                break;
            default:
                return BytecodeTag.kTagRepeatWhile;
        }

        const endRepeat = this.bytecodeArray[endIndex - 1];
        const conditionStartIndex = this.bytecodePosMap.get(endRepeat.pos - endRepeat.obj);

        if (conditionStartIndex === undefined || conditionStartIndex < 1) {
            return BytecodeTag.kTagRepeatWhile;
        }

        let getOp;
        switch (this.bytecodeArray[conditionStartIndex - 1].opcode) {
            case OpCode.kOpSetGlobal:
                getOp = OpCode.kOpGetGlobal;
                break;
            case OpCode.kOpSetGlobal2:
                getOp = OpCode.kOpGetGlobal2;
                break;
            case OpCode.kOpSetProp:
                getOp = OpCode.kOpGetProp;
                break;
            case OpCode.kOpSetParam:
                getOp = OpCode.kOpGetParam;
                break;
            case OpCode.kOpSetLocal:
                getOp = OpCode.kOpGetLocal;
                break;
            default:
                return BytecodeTag.kTagRepeatWhile;
        }

        const setOp = this.bytecodeArray[conditionStartIndex - 1].opcode;
        const varID = this.bytecodeArray[conditionStartIndex - 1].obj;

        if (!(this.bytecodeArray[conditionStartIndex].opcode === getOp &&
              this.bytecodeArray[conditionStartIndex].obj === varID)) {
            return BytecodeTag.kTagRepeatWhile;
        }

        if (endIndex < 5) return BytecodeTag.kTagRepeatWhile;

        const bc = this.bytecodeArray;
        if (up) {
            if (!(bc[endIndex - 5].opcode === OpCode.kOpPushInt8 && bc[endIndex - 5].obj === 1)) {
                return BytecodeTag.kTagRepeatWhile;
            }
        } else {
            if (!(bc[endIndex - 5].opcode === OpCode.kOpPushInt8 && bc[endIndex - 5].obj === -1)) {
                return BytecodeTag.kTagRepeatWhile;
            }
        }
        if (!(bc[endIndex - 4].opcode === getOp && bc[endIndex - 4].obj === varID)) {
            return BytecodeTag.kTagRepeatWhile;
        }
        if (!(bc[endIndex - 3].opcode === OpCode.kOpAdd)) return BytecodeTag.kTagRepeatWhile;
        if (!(bc[endIndex - 2].opcode === setOp && bc[endIndex - 2].obj === varID)) {
            return BytecodeTag.kTagRepeatWhile;
        }

        return up ? BytecodeTag.kTagRepeatWithTo : BytecodeTag.kTagRepeatWithDownTo;
    }

    parse() {
        this.tagLoops();
        this.stack = [];
        this.ast = new AST(this);

        let i = 0;
        while (i < this.bytecodeArray.length) {
            const bytecode = this.bytecodeArray[i];
            const pos = bytecode.pos;

            // Exit last block if at end
            while (pos === this.ast.currentBlock.endPos) {
                const exitedBlock = this.ast.currentBlock;
                const ancestorStmt = this.ast.currentBlock.ancestorStatement();
                this.ast.exitBlock();

                if (ancestorStmt) {
                    if (ancestorStmt.type === NodeType.kIfStmtNode) {
                        if (ancestorStmt.hasElse && exitedBlock === ancestorStmt.block1) {
                            this.ast.enterBlock(ancestorStmt.block2);
                        }
                    } else if (ancestorStmt.type === NodeType.kCaseStmtNode) {
                        const caseLabel = this.ast.currentBlock.currentCaseLabel;
                        if (caseLabel) {
                            if (caseLabel.expect === CaseExpect.kCaseExpectOtherwise) {
                                this.ast.currentBlock.currentCaseLabel = null;
                                ancestorStmt.addOtherwise();
                                const otherwiseIndex = this.bytecodePosMap.get(ancestorStmt.potentialOtherwisePos);
                                if (otherwiseIndex !== undefined) {
                                    this.bytecodeArray[otherwiseIndex].translation = ancestorStmt.otherwise;
                                }
                                this.ast.enterBlock(ancestorStmt.otherwise.block);
                            } else if (caseLabel.expect === CaseExpect.kCaseExpectEnd) {
                                this.ast.currentBlock.currentCaseLabel = null;
                            }
                        }
                    }
                }
            }

            const translateSize = this.translateBytecode(bytecode, i);
            i += translateSize;
        }
    }

    translateBytecode(bytecode, index) {
        if (bytecode.tag === BytecodeTag.kTagSkip || bytecode.tag === BytecodeTag.kTagNextRepeatTarget) {
            return 1;
        }

        let translation = null;
        let nextBlock = null;

        switch (bytecode.opcode) {
            case OpCode.kOpRet:
            case OpCode.kOpRetFactory:
                if (index === this.bytecodeArray.length - 1) {
                    return 1;
                }
                translation = new ExitStmtNode();
                break;

            case OpCode.kOpPushZero:
                translation = new LiteralNode(Datum.fromInt(0));
                break;

            case OpCode.kOpMul:
            case OpCode.kOpAdd:
            case OpCode.kOpSub:
            case OpCode.kOpDiv:
            case OpCode.kOpMod:
            case OpCode.kOpJoinStr:
            case OpCode.kOpJoinPadStr:
            case OpCode.kOpLt:
            case OpCode.kOpLtEq:
            case OpCode.kOpNtEq:
            case OpCode.kOpEq:
            case OpCode.kOpGt:
            case OpCode.kOpGtEq:
            case OpCode.kOpAnd:
            case OpCode.kOpOr:
            case OpCode.kOpContainsStr:
            case OpCode.kOpContains0Str:
                {
                    const b = this.pop();
                    const a = this.pop();
                    translation = new BinaryOpNode(bytecode.opcode, a, b);
                }
                break;

            case OpCode.kOpInv:
                translation = new InverseOpNode(this.pop());
                break;

            case OpCode.kOpNot:
                translation = new NotOpNode(this.pop());
                break;

            case OpCode.kOpGetChunk:
                {
                    const string = this.pop();
                    translation = this.readChunkRef(string);
                }
                break;

            case OpCode.kOpHiliteChunk:
                {
                    let castID = null;
                    if (this.script.version >= 500) {
                        castID = this.pop();
                    }
                    const fieldID = this.pop();
                    const field = new MemberExprNode('field', fieldID, castID);
                    const chunk = this.readChunkRef(field);
                    if (chunk.type === NodeType.kCommentNode) {
                        translation = chunk;
                    } else {
                        translation = new ChunkHiliteStmtNode(chunk);
                    }
                }
                break;

            case OpCode.kOpOntoSpr:
                {
                    const second = this.pop();
                    const first = this.pop();
                    translation = new SpriteIntersectsExprNode(first, second);
                }
                break;

            case OpCode.kOpIntoSpr:
                {
                    const second = this.pop();
                    const first = this.pop();
                    translation = new SpriteWithinExprNode(first, second);
                }
                break;

            case OpCode.kOpGetField:
                {
                    let castID = null;
                    if (this.script.version >= 500) {
                        castID = this.pop();
                    }
                    const fieldID = this.pop();
                    translation = new MemberExprNode('field', fieldID, castID);
                }
                break;

            case OpCode.kOpStartTell:
                {
                    const window = this.pop();
                    const tellStmt = new TellStmtNode(window);
                    translation = tellStmt;
                    nextBlock = tellStmt.block;
                }
                break;

            case OpCode.kOpEndTell:
                this.ast.exitBlock();
                return 1;

            case OpCode.kOpPushList:
                {
                    const list = this.pop();
                    list.getValue().type = DatumType.kDatumList;
                    translation = list;
                }
                break;

            case OpCode.kOpPushPropList:
                {
                    const list = this.pop();
                    list.getValue().type = DatumType.kDatumPropList;
                    translation = list;
                }
                break;

            case OpCode.kOpSwap:
                if (this.stack.length >= 2) {
                    const len = this.stack.length;
                    [this.stack[len - 1], this.stack[len - 2]] = [this.stack[len - 2], this.stack[len - 1]];
                }
                return 1;

            case OpCode.kOpPushInt8:
            case OpCode.kOpPushInt16:
            case OpCode.kOpPushInt32:
                translation = new LiteralNode(Datum.fromInt(bytecode.obj));
                break;

            case OpCode.kOpPushFloat32:
                {
                    // Convert int32 to float32
                    const buffer = new ArrayBuffer(4);
                    const intView = new Int32Array(buffer);
                    const floatView = new Float32Array(buffer);
                    intView[0] = bytecode.obj;
                    translation = new LiteralNode(Datum.fromFloat(floatView[0]));
                }
                break;

            case OpCode.kOpPushArgListNoRet:
                {
                    let argCount = bytecode.obj;
                    const args = [];
                    while (argCount > 0) {
                        argCount--;
                        args.unshift(this.pop());
                    }
                    const argList = new Datum(DatumType.kDatumArgListNoRet, args);
                    translation = new LiteralNode(argList);
                }
                break;

            case OpCode.kOpPushArgList:
                {
                    let argCount = bytecode.obj;
                    const args = [];
                    while (argCount > 0) {
                        argCount--;
                        args.unshift(this.pop());
                    }
                    const argList = new Datum(DatumType.kDatumArgList, args);
                    translation = new LiteralNode(argList);
                }
                break;

            case OpCode.kOpPushCons:
                {
                    const literalID = Math.floor(bytecode.obj / this.variableMultiplier());
                    if (literalID >= 0 && literalID < this.script.literals.length) {
                        translation = new LiteralNode(this.script.literals[literalID].value);
                    } else {
                        translation = new ErrorNode();
                    }
                }
                break;

            case OpCode.kOpPushSymb:
                translation = new LiteralNode(Datum.fromSymbol(this.getName(bytecode.obj)));
                break;

            case OpCode.kOpPushVarRef:
                translation = new LiteralNode(Datum.fromVarRef(this.getName(bytecode.obj)));
                break;

            case OpCode.kOpGetGlobal:
            case OpCode.kOpGetGlobal2:
                translation = new VarNode(this.getName(bytecode.obj));
                break;

            case OpCode.kOpGetProp:
                translation = new VarNode(this.getName(bytecode.obj));
                break;

            case OpCode.kOpGetParam:
                translation = new VarNode(this.getArgumentName(Math.floor(bytecode.obj / this.variableMultiplier())));
                break;

            case OpCode.kOpGetLocal:
                translation = new VarNode(this.getLocalName(Math.floor(bytecode.obj / this.variableMultiplier())));
                break;

            case OpCode.kOpSetGlobal:
            case OpCode.kOpSetGlobal2:
                {
                    const varNode = new VarNode(this.getName(bytecode.obj));
                    const value = this.pop();
                    translation = new AssignmentStmtNode(varNode, value);
                }
                break;

            case OpCode.kOpSetProp:
                {
                    const varNode = new VarNode(this.getName(bytecode.obj));
                    const value = this.pop();
                    translation = new AssignmentStmtNode(varNode, value);
                }
                break;

            case OpCode.kOpSetParam:
                {
                    const varNode = new VarNode(this.getArgumentName(Math.floor(bytecode.obj / this.variableMultiplier())));
                    const value = this.pop();
                    translation = new AssignmentStmtNode(varNode, value);
                }
                break;

            case OpCode.kOpSetLocal:
                {
                    const varNode = new VarNode(this.getLocalName(Math.floor(bytecode.obj / this.variableMultiplier())));
                    const value = this.pop();
                    translation = new AssignmentStmtNode(varNode, value);
                }
                break;

            case OpCode.kOpJmp:
                {
                    const targetPos = bytecode.pos + bytecode.obj;
                    const targetIndex = this.bytecodePosMap.get(targetPos);
                    if (targetIndex !== undefined) {
                        const targetBytecode = this.bytecodeArray[targetIndex];
                        const ancestorLoop = this.ast.currentBlock.ancestorLoop();

                        if (ancestorLoop) {
                            if (targetIndex > 0 &&
                                this.bytecodeArray[targetIndex - 1].opcode === OpCode.kOpEndRepeat &&
                                this.bytecodeArray[targetIndex - 1].ownerLoop === ancestorLoop.startIndex) {
                                translation = new ExitRepeatStmtNode();
                                break;
                            } else if (targetBytecode.tag === BytecodeTag.kTagNextRepeatTarget &&
                                       targetBytecode.ownerLoop === ancestorLoop.startIndex) {
                                translation = new NextRepeatStmtNode();
                                break;
                            }
                        }

                        const nextBytecode = this.bytecodeArray[index + 1];
                        const ancestorStatement = this.ast.currentBlock.ancestorStatement();

                        if (ancestorStatement && nextBytecode && nextBytecode.pos === this.ast.currentBlock.endPos) {
                            if (ancestorStatement.type === NodeType.kIfStmtNode) {
                                if (this.ast.currentBlock === ancestorStatement.block1) {
                                    ancestorStatement.hasElse = true;
                                    ancestorStatement.block2.endPos = targetPos;
                                    return 1;
                                }
                            } else if (ancestorStatement.type === NodeType.kCaseStmtNode) {
                                ancestorStatement.potentialOtherwisePos = bytecode.pos;
                                ancestorStatement.endPos = targetPos;
                                targetBytecode.tag = BytecodeTag.kTagEndCase;
                                return 1;
                            }
                        }

                        if (targetBytecode.opcode === OpCode.kOpPop && targetBytecode.obj === 1) {
                            const value = this.pop();
                            const caseStmt = new CaseStmtNode(value);
                            caseStmt.endPos = targetPos;
                            targetBytecode.tag = BytecodeTag.kTagEndCase;
                            caseStmt.addOtherwise();
                            translation = caseStmt;
                            nextBlock = caseStmt.otherwise.block;
                            break;
                        }
                    }
                    translation = new CommentNode('ERROR: Could not identify jmp');
                }
                break;

            case OpCode.kOpEndRepeat:
                translation = new CommentNode('ERROR: Stray endrepeat');
                break;

            case OpCode.kOpJmpIfZ:
                {
                    const endPos = bytecode.pos + bytecode.obj;
                    const endIndex = this.bytecodePosMap.get(endPos);

                    switch (bytecode.tag) {
                        case BytecodeTag.kTagRepeatWhile:
                            {
                                const condition = this.pop();
                                const loop = new RepeatWhileStmtNode(index, condition);
                                loop.block.endPos = endPos;
                                translation = loop;
                                nextBlock = loop.block;
                            }
                            break;
                        case BytecodeTag.kTagRepeatWithIn:
                            {
                                const list = this.pop();
                                const varName = this.getVarNameFromSet(this.bytecodeArray[index + 5]);
                                const loop = new RepeatWithInStmtNode(index, varName, list);
                                loop.block.endPos = endPos;
                                translation = loop;
                                nextBlock = loop.block;
                            }
                            break;
                        case BytecodeTag.kTagRepeatWithTo:
                        case BytecodeTag.kTagRepeatWithDownTo:
                            {
                                const up = (bytecode.tag === BytecodeTag.kTagRepeatWithTo);
                                const end = this.pop();
                                const start = this.pop();
                                const endRepeat = this.bytecodeArray[endIndex - 1];
                                const conditionStartIndex = this.bytecodePosMap.get(endRepeat.pos - endRepeat.obj);
                                const varName = this.getVarNameFromSet(this.bytecodeArray[conditionStartIndex - 1]);
                                const loop = new RepeatWithToStmtNode(index, varName, start, up, end);
                                loop.block.endPos = endPos;
                                translation = loop;
                                nextBlock = loop.block;
                            }
                            break;
                        default:
                            {
                                const condition = this.pop();
                                const ifStmt = new IfStmtNode(condition);
                                ifStmt.block1.endPos = endPos;
                                translation = ifStmt;
                                nextBlock = ifStmt.block1;
                            }
                            break;
                    }
                }
                break;

            case OpCode.kOpLocalCall:
                {
                    const argList = this.pop();
                    translation = new CallNode(this.script.handlers[bytecode.obj].name, argList);
                }
                break;

            case OpCode.kOpExtCall:
            case OpCode.kOpTellCall:
                {
                    const name = this.getName(bytecode.obj);
                    const argList = this.pop();
                    const isStatement = (argList.getValue().type === DatumType.kDatumArgListNoRet);
                    const rawArgList = argList.getValue().l;
                    const nargs = rawArgList.length;

                    if (isStatement && name === 'sound' && nargs > 0 &&
                        rawArgList[0].type === NodeType.kLiteralNode &&
                        rawArgList[0].getValue().type === DatumType.kDatumSymbol) {
                        const cmd = rawArgList[0].getValue().s;
                        rawArgList.shift();
                        translation = new SoundCmdStmtNode(cmd, argList);
                    } else if (isStatement && name === 'play' && nargs <= 2) {
                        translation = new PlayCmdStmtNode(argList);
                    } else {
                        translation = new CallNode(name, argList);
                    }
                }
                break;

            case OpCode.kOpObjCallV4:
                {
                    const object = this.readVar(bytecode.obj);
                    const argList = this.pop();
                    const rawArgList = argList.getValue().l;
                    if (rawArgList.length > 0) {
                        rawArgList[0] = new VarNode(rawArgList[0].getValue().s);
                    }
                    translation = new ObjCallV4Node(object, argList);
                }
                break;

            case OpCode.kOpPut:
                {
                    const putType = (bytecode.obj >> 4) & 0xF;
                    const varType = bytecode.obj & 0xF;
                    const varNode = this.readVar(varType);
                    const val = this.pop();
                    translation = new PutStmtNode(putType, varNode, val);
                }
                break;

            case OpCode.kOpPutChunk:
                {
                    const putType = (bytecode.obj >> 4) & 0xF;
                    const varType = bytecode.obj & 0xF;
                    const varNode = this.readVar(varType);
                    const chunk = this.readChunkRef(varNode);
                    const val = this.pop();
                    if (chunk.type === NodeType.kCommentNode) {
                        translation = chunk;
                    } else {
                        translation = new PutStmtNode(putType, chunk, val);
                    }
                }
                break;

            case OpCode.kOpDeleteChunk:
                {
                    const varNode = this.readVar(bytecode.obj);
                    const chunk = this.readChunkRef(varNode);
                    if (chunk.type === NodeType.kCommentNode) {
                        translation = chunk;
                    } else {
                        translation = new ChunkDeleteStmtNode(chunk);
                    }
                }
                break;

            case OpCode.kOpGet:
                {
                    const propertyID = this.pop().getValue().toInt();
                    translation = this.readV4Property(bytecode.obj, propertyID);
                }
                break;

            case OpCode.kOpSet:
                {
                    const propertyID = this.pop().getValue().toInt();
                    const value = this.pop();
                    if (bytecode.obj === 0x00 && propertyID >= 0x01 && propertyID <= 0x05 &&
                        value.getValue().type === DatumType.kDatumString) {
                        const scriptText = value.getValue().s;
                        if (scriptText.length > 0 && (scriptText[0] === ' ' || scriptText.includes('\r'))) {
                            translation = new WhenStmtNode(propertyID, scriptText);
                        }
                    }
                    if (!translation) {
                        const prop = this.readV4Property(bytecode.obj, propertyID);
                        if (prop.type === NodeType.kCommentNode) {
                            translation = prop;
                        } else {
                            translation = new AssignmentStmtNode(prop, value, true);
                        }
                    }
                }
                break;

            case OpCode.kOpGetMovieProp:
                translation = new TheExprNode(this.getName(bytecode.obj));
                break;

            case OpCode.kOpSetMovieProp:
                {
                    const value = this.pop();
                    const prop = new TheExprNode(this.getName(bytecode.obj));
                    translation = new AssignmentStmtNode(prop, value);
                }
                break;

            case OpCode.kOpGetObjProp:
            case OpCode.kOpGetChainedProp:
                {
                    const object = this.pop();
                    translation = new ObjPropExprNode(object, this.getName(bytecode.obj));
                }
                break;

            case OpCode.kOpSetObjProp:
                {
                    const value = this.pop();
                    const object = this.pop();
                    const prop = new ObjPropExprNode(object, this.getName(bytecode.obj));
                    translation = new AssignmentStmtNode(prop, value);
                }
                break;

            case OpCode.kOpPeek:
                {
                    const prevLabel = this.ast.currentBlock.currentCaseLabel;
                    const originalStackSize = this.stack.length;
                    let currIndex = index + 1;
                    let currBytecode = this.bytecodeArray[currIndex];

                    while (currIndex < this.bytecodeArray.length &&
                           !(this.stack.length === originalStackSize + 1 &&
                             (currBytecode.opcode === OpCode.kOpEq || currBytecode.opcode === OpCode.kOpNtEq))) {
                        this.translateBytecode(currBytecode, currIndex);
                        currIndex++;
                        currBytecode = this.bytecodeArray[currIndex];
                    }

                    if (currIndex >= this.bytecodeArray.length) {
                        bytecode.translation = new CommentNode('ERROR: Expected eq or nteq!');
                        this.ast.addStatement(bytecode.translation);
                        return currIndex - index + 1;
                    }

                    const notEq = (currBytecode.opcode === OpCode.kOpNtEq);
                    const caseValue = this.pop();

                    currIndex++;
                    currBytecode = this.bytecodeArray[currIndex];

                    if (currIndex >= this.bytecodeArray.length || currBytecode.opcode !== OpCode.kOpJmpIfZ) {
                        bytecode.translation = new CommentNode('ERROR: Expected jmpifz!');
                        this.ast.addStatement(bytecode.translation);
                        return currIndex - index + 1;
                    }

                    const jmpifz = currBytecode;
                    const jmpPos = jmpifz.pos + jmpifz.obj;
                    const targetIndex = this.bytecodePosMap.get(jmpPos);
                    const targetBytecode = this.bytecodeArray[targetIndex];
                    const prevFromTarget = this.bytecodeArray[targetIndex - 1];

                    let expect;
                    if (notEq) {
                        expect = CaseExpect.kCaseExpectOr;
                    } else if (targetBytecode.opcode === OpCode.kOpPeek) {
                        expect = CaseExpect.kCaseExpectNext;
                    } else if (targetBytecode.opcode === OpCode.kOpPop &&
                               targetBytecode.obj === 1 &&
                               (!prevFromTarget || prevFromTarget.opcode !== OpCode.kOpJmp ||
                                prevFromTarget.pos + prevFromTarget.obj === targetBytecode.pos)) {
                        expect = CaseExpect.kCaseExpectEnd;
                    } else {
                        expect = CaseExpect.kCaseExpectOtherwise;
                    }

                    const currLabel = new CaseLabelNode(caseValue, expect);
                    jmpifz.translation = currLabel;
                    this.ast.currentBlock.currentCaseLabel = currLabel;

                    if (!prevLabel) {
                        const peekedValue = this.pop();
                        const caseStmt = new CaseStmtNode(peekedValue);
                        caseStmt.firstLabel = currLabel;
                        currLabel.parent = caseStmt;
                        bytecode.translation = caseStmt;
                        this.ast.addStatement(caseStmt);
                    } else if (prevLabel.expect === CaseExpect.kCaseExpectOr) {
                        prevLabel.nextOr = currLabel;
                        currLabel.parent = prevLabel;
                    } else if (prevLabel.expect === CaseExpect.kCaseExpectNext) {
                        prevLabel.nextLabel = currLabel;
                        currLabel.parent = prevLabel;
                    }

                    if (currLabel.expect !== CaseExpect.kCaseExpectOr) {
                        currLabel.block = new BlockNode();
                        currLabel.block.parent = currLabel;
                        currLabel.block.endPos = jmpPos;
                        this.ast.enterBlock(currLabel.block);
                    }

                    return currIndex - index + 1;
                }

            case OpCode.kOpPop:
                if (bytecode.tag === BytecodeTag.kTagEndCase) {
                    bytecode.translation = new EndCaseNode();
                    return 1;
                }
                if (bytecode.obj === 1 && this.stack.length === 1) {
                    const value = this.pop();
                    translation = new CaseStmtNode(value);
                    break;
                }
                return 1;

            case OpCode.kOpTheBuiltin:
                this.pop(); // empty arglist
                translation = new TheExprNode(this.getName(bytecode.obj));
                break;

            case OpCode.kOpObjCall:
                {
                    const method = this.getName(bytecode.obj);
                    const argList = this.pop();
                    const rawArgList = argList.getValue().l;
                    const nargs = rawArgList.length;

                    if (method === 'getAt' && nargs === 2) {
                        translation = new ObjBracketExprNode(rawArgList[0], rawArgList[1]);
                    } else if (method === 'setAt' && nargs === 3) {
                        const propExpr = new ObjBracketExprNode(rawArgList[0], rawArgList[1]);
                        translation = new AssignmentStmtNode(propExpr, rawArgList[2]);
                    } else if ((method === 'getProp' || method === 'getPropRef') &&
                               (nargs === 3 || nargs === 4) &&
                               rawArgList[1].getValue().type === DatumType.kDatumSymbol) {
                        const propName = rawArgList[1].getValue().s;
                        const i2 = (nargs === 4) ? rawArgList[3] : null;
                        translation = new ObjPropIndexExprNode(rawArgList[0], propName, rawArgList[2], i2);
                    } else if (method === 'setProp' && (nargs === 4 || nargs === 5) &&
                               rawArgList[1].getValue().type === DatumType.kDatumSymbol) {
                        const propName = rawArgList[1].getValue().s;
                        const i2 = (nargs === 5) ? rawArgList[3] : null;
                        const propExpr = new ObjPropIndexExprNode(rawArgList[0], propName, rawArgList[2], i2);
                        translation = new AssignmentStmtNode(propExpr, rawArgList[nargs - 1]);
                    } else if (method === 'count' && nargs === 2 &&
                               rawArgList[1].getValue().type === DatumType.kDatumSymbol) {
                        const propName = rawArgList[1].getValue().s;
                        const propExpr = new ObjPropExprNode(rawArgList[0], propName);
                        translation = new ObjPropExprNode(propExpr, 'count');
                    } else if ((method === 'setContents' || method === 'setContentsAfter' || method === 'setContentsBefore') && nargs === 2) {
                        let putType;
                        if (method === 'setContents') {
                            putType = PutType.kPutInto;
                        } else if (method === 'setContentsAfter') {
                            putType = PutType.kPutAfter;
                        } else {
                            putType = PutType.kPutBefore;
                        }
                        translation = new PutStmtNode(putType, rawArgList[0], rawArgList[1]);
                    } else if (method === 'hilite' && nargs === 1) {
                        translation = new ChunkHiliteStmtNode(rawArgList[0]);
                    } else if (method === 'delete' && nargs === 1) {
                        translation = new ChunkDeleteStmtNode(rawArgList[0]);
                    } else {
                        translation = new ObjCallNode(method, argList);
                    }
                }
                break;

            case OpCode.kOpPushChunkVarRef:
                translation = this.readVar(bytecode.obj);
                break;

            case OpCode.kOpGetTopLevelProp:
                translation = new VarNode(this.getName(bytecode.obj));
                break;

            case OpCode.kOpNewObj:
                {
                    const objType = this.getName(bytecode.obj);
                    const objArgs = this.pop();
                    translation = new NewObjNode(objType, objArgs);
                }
                break;

            default:
                {
                    let commentText = StandardNames.getOpcodeName(bytecode.opID);
                    if (bytecode.opcode >= 0x40) {
                        commentText += ' ' + bytecode.obj;
                    }
                    translation = new CommentNode(commentText);
                    this.stack = [];
                }
        }

        if (!translation) {
            translation = new ErrorNode();
        }

        bytecode.translation = translation;
        if (translation.isExpression) {
            this.stack.push(translation);
        } else {
            this.ast.addStatement(translation);
        }

        if (nextBlock) {
            this.ast.enterBlock(nextBlock);
        }

        return 1;
    }

    writeBytecodeText(code, dotSyntax) {
        const isMethod = this.script.isFactory();

        if (!this.isGenericEvent) {
            if (isMethod) {
                code.write('method ');
            } else {
                code.write('on ');
            }
            code.write(this.name);
            if (this.argumentNames.length > 0) {
                code.write(' ');
                for (let i = 0; i < this.argumentNames.length; i++) {
                    if (i > 0) code.write(', ');
                    code.write(this.argumentNames[i]);
                }
            }
            code.writeLine();
            code.indent();
        }

        for (const bytecode of this.bytecodeArray) {
            code.write('[' + bytecode.pos.toString().padStart(3) + ']');
            code.write(' ');
            code.write(StandardNames.getOpcodeName(bytecode.opID));

            switch (bytecode.opcode) {
                case OpCode.kOpJmp:
                case OpCode.kOpJmpIfZ:
                    code.write(' [' + (bytecode.pos + bytecode.obj).toString().padStart(3) + ']');
                    break;
                case OpCode.kOpEndRepeat:
                    code.write(' [' + (bytecode.pos - bytecode.obj).toString().padStart(3) + ']');
                    break;
                case OpCode.kOpPushFloat32:
                    {
                        const buffer = new ArrayBuffer(4);
                        const intView = new Int32Array(buffer);
                        const floatView = new Float32Array(buffer);
                        intView[0] = bytecode.obj;
                        code.write(' ' + floatView[0]);
                    }
                    break;
                default:
                    if (bytecode.opID > 0x40) {
                        code.write(' ' + bytecode.obj);
                    }
                    break;
            }

            if (bytecode.translation) {
                code.write(' ...');
                while (code.lineWidth < 49) {
                    code.write('.');
                }
                code.write(' ');
                if (bytecode.translation.isExpression) {
                    code.write('<');
                }
                bytecode.translation.writeScriptText(code, dotSyntax, true);
                if (bytecode.translation.isExpression) {
                    code.write('>');
                }
            }
            code.writeLine();
        }

        if (!this.isGenericEvent) {
            code.unindent();
            if (!isMethod) {
                code.writeLine('end');
            }
        }
    }
}
