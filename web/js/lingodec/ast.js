/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    DatumType, NodeType, OpCode, ChunkExprType, PutType, CaseExpect
} from './enums.js';
import { StandardNames } from './names.js';

/**
 * Escape a string for output
 */
export function escapeString(str) {
    let res = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        switch (ch) {
            case 0x22: // "
                res += '\\"';
                break;
            case 0x5C: // \
                res += '\\\\';
                break;
            case 0x08: // \b
                res += '\\b';
                break;
            case 0x0C: // \f
                res += '\\f';
                break;
            case 0x0A: // \n
                res += '\\n';
                break;
            case 0x0D: // \r
                res += '\\r';
                break;
            case 0x09: // \t
                res += '\\t';
                break;
            case 0x0B: // \v
                res += '\\v';
                break;
            default:
                if (ch < 0x20 || ch > 0x7f) {
                    res += '\\x' + ch.toString(16).padStart(2, '0').toUpperCase();
                } else {
                    res += str[i];
                }
                break;
        }
    }
    return res;
}

/**
 * Convert float to string with minimal precision
 */
export function floatToString(f) {
    // Use toPrecision with max digits then strip trailing zeros
    let res = f.toPrecision(17);
    // Remove trailing zeros after decimal point
    if (res.includes('.')) {
        res = res.replace(/\.?0+$/, '');
        // Ensure at least one digit after decimal
        if (!res.includes('.')) {
            res += '.0';
        }
    }
    return res;
}

/**
 * CodeWriter - Formats code output with indentation
 */
export class CodeWriter {
    constructor(lineEnding = '\n', indentation = '  ') {
        this._output = '';
        this._lineEnding = lineEnding;
        this._indentation = indentation;
        this._indentationLevel = 0;
        this._indentationWritten = false;
        this._lineWidth = 0;
        this._size = 0;
        this.doIndentation = true;
    }

    write(str) {
        if (this.doIndentation && !this._indentationWritten) {
            this._writeIndentation();
        }
        this._output += str;
        this._lineWidth += str.length;
        this._size += str.length;
    }

    writeLine(str = '') {
        if (str) {
            this.write(str);
        }
        this._output += this._lineEnding;
        this._size += this._lineEnding.length;
        this._lineWidth = 0;
        this._indentationWritten = false;
    }

    indent() {
        this._indentationLevel++;
    }

    unindent() {
        if (this._indentationLevel > 0) {
            this._indentationLevel--;
        }
    }

    str() {
        return this._output;
    }

    get lineWidth() {
        return this._lineWidth;
    }

    get size() {
        return this._size;
    }

    _writeIndentation() {
        for (let i = 0; i < this._indentationLevel; i++) {
            this._output += this._indentation;
            this._lineWidth += this._indentation.length;
            this._size += this._indentation.length;
        }
        this._indentationWritten = true;
    }
}

/**
 * Datum - Represents a literal value
 */
export class Datum {
    constructor(typeOrValue, value) {
        if (typeOrValue === undefined) {
            this.type = DatumType.kDatumVoid;
            this.i = 0;
            this.f = 0;
            this.s = '';
            this.l = [];
        } else if (typeof typeOrValue === 'number' && value === undefined) {
            // Integer constructor
            this.type = DatumType.kDatumInt;
            this.i = typeOrValue;
            this.f = 0;
            this.s = '';
            this.l = [];
        } else if (typeof typeOrValue === 'number' && typeof value === 'number') {
            // Float constructor (type, value)
            this.type = DatumType.kDatumFloat;
            this.i = 0;
            this.f = value;
            this.s = '';
            this.l = [];
        } else if (typeof typeOrValue === 'number' && typeof value === 'string') {
            // String/Symbol constructor (type, string)
            this.type = typeOrValue;
            this.i = 0;
            this.f = 0;
            this.s = value;
            this.l = [];
        } else if (typeof typeOrValue === 'number' && Array.isArray(value)) {
            // List constructor (type, array)
            this.type = typeOrValue;
            this.i = 0;
            this.f = 0;
            this.s = '';
            this.l = value;
        } else {
            this.type = DatumType.kDatumVoid;
            this.i = 0;
            this.f = 0;
            this.s = '';
            this.l = [];
        }
    }

    static fromInt(val) {
        const d = new Datum();
        d.type = DatumType.kDatumInt;
        d.i = val;
        return d;
    }

    static fromFloat(val) {
        const d = new Datum();
        d.type = DatumType.kDatumFloat;
        d.f = val;
        return d;
    }

    static fromString(val) {
        const d = new Datum();
        d.type = DatumType.kDatumString;
        d.s = val;
        return d;
    }

    static fromSymbol(val) {
        const d = new Datum();
        d.type = DatumType.kDatumSymbol;
        d.s = val;
        return d;
    }

    static fromVarRef(val) {
        const d = new Datum();
        d.type = DatumType.kDatumVarRef;
        d.s = val;
        return d;
    }

    toInt() {
        switch (this.type) {
            case DatumType.kDatumInt:
                return this.i;
            case DatumType.kDatumFloat:
                return Math.floor(this.f);
            default:
                return 0;
        }
    }

    writeScriptText(code, dot, sum) {
        switch (this.type) {
            case DatumType.kDatumVoid:
                code.write('VOID');
                return;
            case DatumType.kDatumSymbol:
                code.write('#' + this.s);
                return;
            case DatumType.kDatumVarRef:
                code.write(this.s);
                return;
            case DatumType.kDatumString:
                if (this.s.length === 0) {
                    code.write('EMPTY');
                    return;
                }
                if (this.s.length === 1) {
                    switch (this.s.charCodeAt(0)) {
                        case 0x03:
                            code.write('ENTER');
                            return;
                        case 0x08:
                            code.write('BACKSPACE');
                            return;
                        case 0x09:
                            code.write('TAB');
                            return;
                        case 0x0D:
                            code.write('RETURN');
                            return;
                        case 0x22:
                            code.write('QUOTE');
                            return;
                    }
                }
                if (sum) {
                    code.write('"' + escapeString(this.s) + '"');
                    return;
                }
                code.write('"' + this.s + '"');
                return;
            case DatumType.kDatumInt:
                code.write(this.i.toString());
                return;
            case DatumType.kDatumFloat:
                code.write(floatToString(this.f));
                return;
            case DatumType.kDatumList:
            case DatumType.kDatumArgList:
            case DatumType.kDatumArgListNoRet:
                if (this.type === DatumType.kDatumList) {
                    code.write('[');
                }
                for (let i = 0; i < this.l.length; i++) {
                    if (i > 0) {
                        code.write(', ');
                    }
                    this.l[i].writeScriptText(code, dot, sum);
                }
                if (this.type === DatumType.kDatumList) {
                    code.write(']');
                }
                return;
            case DatumType.kDatumPropList:
                code.write('[');
                if (this.l.length === 0) {
                    code.write(':');
                } else {
                    for (let i = 0; i < this.l.length; i += 2) {
                        if (i > 0) {
                            code.write(', ');
                        }
                        this.l[i].writeScriptText(code, dot, sum);
                        code.write(': ');
                        this.l[i + 1].writeScriptText(code, dot, sum);
                    }
                }
                code.write(']');
                return;
        }
    }
}

/**
 * Node - Base class for all AST nodes
 */
export class Node {
    constructor(type) {
        this.type = type;
        this.isExpression = false;
        this.isStatement = false;
        this.isLabel = false;
        this.isLoop = false;
        this.parent = null;
    }

    writeScriptText(code, dot, sum) {
        // Override in subclasses
    }

    getValue() {
        return new Datum();
    }

    ancestorStatement() {
        let ancestor = this.parent;
        while (ancestor && !ancestor.isStatement) {
            ancestor = ancestor.parent;
        }
        return ancestor;
    }

    ancestorLoop() {
        let ancestor = this.parent;
        while (ancestor && !ancestor.isLoop) {
            ancestor = ancestor.parent;
        }
        return ancestor;
    }

    hasSpaces(dot) {
        return true;
    }
}

/**
 * ExprNode - Base class for expression nodes
 */
export class ExprNode extends Node {
    constructor(type) {
        super(type);
        this.isExpression = true;
    }
}

/**
 * StmtNode - Base class for statement nodes
 */
export class StmtNode extends Node {
    constructor(type) {
        super(type);
        this.isStatement = true;
    }
}

/**
 * LabelNode - Base class for label nodes
 */
export class LabelNode extends Node {
    constructor(type) {
        super(type);
        this.isLabel = true;
    }
}

/**
 * LoopNode - Base class for loop statement nodes
 */
export class LoopNode extends StmtNode {
    constructor(type, startIndex) {
        super(type);
        this.startIndex = startIndex;
        this.isLoop = true;
    }
}

/**
 * ErrorNode - Represents an error in decompilation
 */
export class ErrorNode extends ExprNode {
    constructor() {
        super(NodeType.kErrorNode);
    }

    writeScriptText(code, dot, sum) {
        code.write('ERROR');
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * CommentNode - Represents a comment
 */
export class CommentNode extends Node {
    constructor(text) {
        super(NodeType.kCommentNode);
        this.text = text;
    }

    writeScriptText(code, dot, sum) {
        code.write('-- ');
        code.write(this.text);
    }
}

/**
 * LiteralNode - Represents a literal value
 */
export class LiteralNode extends ExprNode {
    constructor(value) {
        super(NodeType.kLiteralNode);
        this.value = value;
    }

    writeScriptText(code, dot, sum) {
        this.value.writeScriptText(code, dot, sum);
    }

    getValue() {
        return this.value;
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * BlockNode - Represents a block of statements
 */
export class BlockNode extends Node {
    constructor() {
        super(NodeType.kBlockNode);
        this.children = [];
        this.endPos = 0xFFFFFFFF;
        this.currentCaseLabel = null;
    }

    writeScriptText(code, dot, sum) {
        for (const child of this.children) {
            child.writeScriptText(code, dot, sum);
            code.writeLine();
        }
    }

    addChild(child) {
        child.parent = this;
        this.children.push(child);
    }
}

/**
 * HandlerNode - Represents a handler (function) definition
 */
export class HandlerNode extends Node {
    constructor(handler) {
        super(NodeType.kHandlerNode);
        this.handler = handler;
        this.block = new BlockNode();
        this.block.parent = this;
    }

    writeScriptText(code, dot, sum) {
        if (this.handler.isGenericEvent) {
            this.block.writeScriptText(code, dot, sum);
        } else {
            const script = this.handler.script;
            const isMethod = script.isFactory();
            if (isMethod) {
                code.write('method ');
            } else {
                code.write('on ');
            }
            code.write(this.handler.name);
            if (this.handler.argumentNames.length > 0) {
                code.write(' ');
                for (let i = 0; i < this.handler.argumentNames.length; i++) {
                    if (i > 0) {
                        code.write(', ');
                    }
                    code.write(this.handler.argumentNames[i]);
                }
            }
            code.writeLine();
            code.indent();
            if (isMethod && script.propertyNames.length > 0 && this.handler === script.handlers[0]) {
                code.write('instance ');
                for (let i = 0; i < script.propertyNames.length; i++) {
                    if (i > 0) {
                        code.write(', ');
                    }
                    code.write(script.propertyNames[i]);
                }
                code.writeLine();
            }
            if (this.handler.globalNames.length > 0) {
                code.write('global ');
                for (let i = 0; i < this.handler.globalNames.length; i++) {
                    if (i > 0) {
                        code.write(', ');
                    }
                    code.write(this.handler.globalNames[i]);
                }
                code.writeLine();
            }
            this.block.writeScriptText(code, dot, sum);
            code.unindent();
            if (!isMethod) {
                code.writeLine('end');
            }
        }
    }
}

/**
 * ExitStmtNode - exit statement
 */
export class ExitStmtNode extends StmtNode {
    constructor() {
        super(NodeType.kExitStmtNode);
    }

    writeScriptText(code, dot, sum) {
        code.write('exit');
    }
}

/**
 * InverseOpNode - Unary minus operator
 */
export class InverseOpNode extends ExprNode {
    constructor(operand) {
        super(NodeType.kInverseOpNode);
        this.operand = operand;
        this.operand.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('-');
        const parenOperand = this.operand.hasSpaces(dot);
        if (parenOperand) {
            code.write('(');
        }
        this.operand.writeScriptText(code, dot, sum);
        if (parenOperand) {
            code.write(')');
        }
    }
}

/**
 * NotOpNode - Logical not operator
 */
export class NotOpNode extends ExprNode {
    constructor(operand) {
        super(NodeType.kNotOpNode);
        this.operand = operand;
        this.operand.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('not ');
        const parenOperand = this.operand.hasSpaces(dot);
        if (parenOperand) {
            code.write('(');
        }
        this.operand.writeScriptText(code, dot, sum);
        if (parenOperand) {
            code.write(')');
        }
    }
}

/**
 * BinaryOpNode - Binary operator expression
 */
export class BinaryOpNode extends ExprNode {
    constructor(opcode, left, right) {
        super(NodeType.kBinaryOpNode);
        this.opcode = opcode;
        this.left = left;
        this.left.parent = this;
        this.right = right;
        this.right.parent = this;
    }

    writeScriptText(code, dot, sum) {
        const precedence = this.getPrecedence();
        let parenLeft = false;
        let parenRight = false;
        if (precedence) {
            if (this.left.type === NodeType.kBinaryOpNode) {
                parenLeft = (this.left.getPrecedence() !== precedence);
            }
            parenRight = (this.right.type === NodeType.kBinaryOpNode);
        }

        if (parenLeft) {
            code.write('(');
        }
        this.left.writeScriptText(code, dot, sum);
        if (parenLeft) {
            code.write(')');
        }

        code.write(' ');
        code.write(StandardNames.getName(StandardNames.binaryOpNames, this.opcode));
        code.write(' ');

        if (parenRight) {
            code.write('(');
        }
        this.right.writeScriptText(code, dot, sum);
        if (parenRight) {
            code.write(')');
        }
    }

    getPrecedence() {
        switch (this.opcode) {
            case OpCode.kOpMul:
            case OpCode.kOpDiv:
            case OpCode.kOpMod:
                return 1;
            case OpCode.kOpAdd:
            case OpCode.kOpSub:
                return 2;
            case OpCode.kOpLt:
            case OpCode.kOpLtEq:
            case OpCode.kOpNtEq:
            case OpCode.kOpEq:
            case OpCode.kOpGt:
            case OpCode.kOpGtEq:
                return 3;
            case OpCode.kOpAnd:
                return 4;
            case OpCode.kOpOr:
                return 5;
            default:
                return 0;
        }
    }
}

/**
 * ChunkExprNode - Chunk expression (char/word/item/line of string)
 */
export class ChunkExprNode extends ExprNode {
    constructor(chunkType, first, last, string) {
        super(NodeType.kChunkExprNode);
        this.chunkType = chunkType;
        this.first = first;
        this.first.parent = this;
        this.last = last;
        this.last.parent = this;
        this.string = string;
        this.string.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write(StandardNames.getName(StandardNames.chunkTypeNames, this.chunkType));
        code.write(' ');
        const parenFirst = this.first.hasSpaces(dot);
        if (parenFirst) {
            code.write('(');
        }
        this.first.writeScriptText(code, dot, sum);
        if (parenFirst) {
            code.write(')');
        }

        // Check if last is not 0 (meaning we have a range)
        const lastValue = this.last.getValue();
        if (!(this.last.type === NodeType.kLiteralNode &&
              lastValue.type === DatumType.kDatumInt &&
              lastValue.i === 0)) {
            code.write(' to ');
            const parenLast = this.last.hasSpaces(dot);
            if (parenLast) {
                code.write('(');
            }
            this.last.writeScriptText(code, dot, sum);
            if (parenLast) {
                code.write(')');
            }
        }

        code.write(' of ');
        const stringIsBiggerChunk = this.string.type === NodeType.kChunkExprNode &&
                                    this.string.chunkType > this.chunkType;
        const parenString = !stringIsBiggerChunk && this.string.hasSpaces(dot);
        if (parenString) {
            code.write('(');
        }
        this.string.writeScriptText(code, false, sum); // always verbose
        if (parenString) {
            code.write(')');
        }
    }
}

/**
 * ChunkHiliteStmtNode - hilite chunk statement
 */
export class ChunkHiliteStmtNode extends StmtNode {
    constructor(chunk) {
        super(NodeType.kChunkHiliteStmtNode);
        this.chunk = chunk;
        this.chunk.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('hilite ');
        this.chunk.writeScriptText(code, dot, sum);
    }
}

/**
 * ChunkDeleteStmtNode - delete chunk statement
 */
export class ChunkDeleteStmtNode extends StmtNode {
    constructor(chunk) {
        super(NodeType.kChunkDeleteStmtNode);
        this.chunk = chunk;
        this.chunk.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('delete ');
        this.chunk.writeScriptText(code, dot, sum);
    }
}

/**
 * SpriteIntersectsExprNode - sprite intersects expression
 */
export class SpriteIntersectsExprNode extends ExprNode {
    constructor(firstSprite, secondSprite) {
        super(NodeType.kSpriteIntersectsExprNode);
        this.firstSprite = firstSprite;
        this.firstSprite.parent = this;
        this.secondSprite = secondSprite;
        this.secondSprite.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('sprite ');
        const parenFirst = (this.firstSprite.type === NodeType.kBinaryOpNode);
        if (parenFirst) {
            code.write('(');
        }
        this.firstSprite.writeScriptText(code, dot, sum);
        if (parenFirst) {
            code.write(')');
        }
        code.write(' intersects ');
        const parenSecond = (this.secondSprite.type === NodeType.kBinaryOpNode);
        if (parenSecond) {
            code.write('(');
        }
        this.secondSprite.writeScriptText(code, dot, sum);
        if (parenSecond) {
            code.write(')');
        }
    }
}

/**
 * SpriteWithinExprNode - sprite within expression
 */
export class SpriteWithinExprNode extends ExprNode {
    constructor(firstSprite, secondSprite) {
        super(NodeType.kSpriteWithinExprNode);
        this.firstSprite = firstSprite;
        this.firstSprite.parent = this;
        this.secondSprite = secondSprite;
        this.secondSprite.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('sprite ');
        const parenFirst = (this.firstSprite.type === NodeType.kBinaryOpNode);
        if (parenFirst) {
            code.write('(');
        }
        this.firstSprite.writeScriptText(code, dot, sum);
        if (parenFirst) {
            code.write(')');
        }
        code.write(' within ');
        const parenSecond = (this.secondSprite.type === NodeType.kBinaryOpNode);
        if (parenSecond) {
            code.write('(');
        }
        this.secondSprite.writeScriptText(code, dot, sum);
        if (parenSecond) {
            code.write(')');
        }
    }
}

/**
 * MemberExprNode - member/cast expression
 */
export class MemberExprNode extends ExprNode {
    constructor(memberType, memberID, castID) {
        super(NodeType.kMemberExprNode);
        this.memberType = memberType;
        this.memberID = memberID;
        this.memberID.parent = this;
        if (castID) {
            this.castID = castID;
            this.castID.parent = this;
        } else {
            this.castID = null;
        }
    }

    writeScriptText(code, dot, sum) {
        const castIDValue = this.castID ? this.castID.getValue() : null;
        const hasCastID = this.castID &&
            !(this.castID.type === NodeType.kLiteralNode &&
              castIDValue.type === DatumType.kDatumInt &&
              castIDValue.i === 0);

        code.write(this.memberType);
        if (dot) {
            code.write('(');
            this.memberID.writeScriptText(code, dot, sum);
            if (hasCastID) {
                code.write(', ');
                this.castID.writeScriptText(code, dot, sum);
            }
            code.write(')');
        } else {
            code.write(' ');
            const parenMemberID = (this.memberID.type === NodeType.kBinaryOpNode);
            if (parenMemberID) {
                code.write('(');
            }
            this.memberID.writeScriptText(code, dot, sum);
            if (parenMemberID) {
                code.write(')');
            }
            if (hasCastID) {
                code.write(' of castLib ');
                const parenCastID = (this.castID.type === NodeType.kBinaryOpNode);
                if (parenCastID) {
                    code.write('(');
                }
                this.castID.writeScriptText(code, dot, sum);
                if (parenCastID) {
                    code.write(')');
                }
            }
        }
    }

    hasSpaces(dot) {
        return !dot;
    }
}

/**
 * VarNode - Variable reference
 */
export class VarNode extends ExprNode {
    constructor(varName) {
        super(NodeType.kVarNode);
        this.varName = varName;
    }

    writeScriptText(code, dot, sum) {
        code.write(this.varName);
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * AssignmentStmtNode - Assignment statement
 */
export class AssignmentStmtNode extends StmtNode {
    constructor(variable, value, forceVerbose = false) {
        super(NodeType.kAssignmentStmtNode);
        this.variable = variable;
        this.variable.parent = this;
        this.value = value;
        this.value.parent = this;
        this.forceVerbose = forceVerbose;
    }

    writeScriptText(code, dot, sum) {
        if (!dot || this.forceVerbose) {
            code.write('set ');
            this.variable.writeScriptText(code, false, sum); // always verbose
            code.write(' to ');
            this.value.writeScriptText(code, dot, sum);
        } else {
            this.variable.writeScriptText(code, dot, sum);
            code.write(' = ');
            this.value.writeScriptText(code, dot, sum);
        }
    }
}

/**
 * IfStmtNode - If statement
 */
export class IfStmtNode extends StmtNode {
    constructor(condition) {
        super(NodeType.kIfStmtNode);
        this.hasElse = false;
        this.condition = condition;
        this.condition.parent = this;
        this.block1 = new BlockNode();
        this.block1.parent = this;
        this.block2 = new BlockNode();
        this.block2.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('if ');
        this.condition.writeScriptText(code, dot, sum);
        code.write(' then');
        if (sum) {
            if (this.hasElse) {
                code.write(' / else');
            }
        } else {
            code.writeLine();
            code.indent();
            this.block1.writeScriptText(code, dot, sum);
            code.unindent();
            if (this.hasElse) {
                code.writeLine('else');
                code.indent();
                this.block2.writeScriptText(code, dot, sum);
                code.unindent();
            }
            code.write('end if');
        }
    }
}

/**
 * RepeatWhileStmtNode - repeat while statement
 */
export class RepeatWhileStmtNode extends LoopNode {
    constructor(startIndex, condition) {
        super(NodeType.kRepeatWhileStmtNode, startIndex);
        this.condition = condition;
        this.condition.parent = this;
        this.block = new BlockNode();
        this.block.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('repeat while ');
        this.condition.writeScriptText(code, dot, sum);
        if (!sum) {
            code.writeLine();
            code.indent();
            this.block.writeScriptText(code, dot, sum);
            code.unindent();
            code.write('end repeat');
        }
    }
}

/**
 * RepeatWithInStmtNode - repeat with ... in statement
 */
export class RepeatWithInStmtNode extends LoopNode {
    constructor(startIndex, varName, list) {
        super(NodeType.kRepeatWithInStmtNode, startIndex);
        this.varName = varName;
        this.list = list;
        this.list.parent = this;
        this.block = new BlockNode();
        this.block.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('repeat with ');
        code.write(this.varName);
        code.write(' in ');
        this.list.writeScriptText(code, dot, sum);
        if (!sum) {
            code.writeLine();
            code.indent();
            this.block.writeScriptText(code, dot, sum);
            code.unindent();
            code.write('end repeat');
        }
    }
}

/**
 * RepeatWithToStmtNode - repeat with ... = ... to/down to statement
 */
export class RepeatWithToStmtNode extends LoopNode {
    constructor(startIndex, varName, start, up, end) {
        super(NodeType.kRepeatWithToStmtNode, startIndex);
        this.varName = varName;
        this.start = start;
        this.start.parent = this;
        this.up = up;
        this.end = end;
        this.end.parent = this;
        this.block = new BlockNode();
        this.block.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('repeat with ');
        code.write(this.varName);
        code.write(' = ');
        this.start.writeScriptText(code, dot, sum);
        if (this.up) {
            code.write(' to ');
        } else {
            code.write(' down to ');
        }
        this.end.writeScriptText(code, dot, sum);
        if (!sum) {
            code.writeLine();
            code.indent();
            this.block.writeScriptText(code, dot, sum);
            code.unindent();
            code.write('end repeat');
        }
    }
}

/**
 * CaseLabelNode - case label
 */
export class CaseLabelNode extends LabelNode {
    constructor(value, expect) {
        super(NodeType.kCaseLabelNode);
        this.value = value;
        this.value.parent = this;
        this.expect = expect;
        this.nextOr = null;
        this.nextLabel = null;
        this.block = null;
    }

    writeScriptText(code, dot, sum) {
        if (sum) {
            code.write('(case) ');
            if (this.parent && this.parent.type === NodeType.kCaseLabelNode) {
                if (this.parent.nextOr === this) {
                    code.write('..., ');
                }
            }
            const parenValue = this.value.hasSpaces(dot);
            if (parenValue) {
                code.write('(');
            }
            this.value.writeScriptText(code, dot, sum);
            if (parenValue) {
                code.write(')');
            }
            if (this.nextOr) {
                code.write(', ...');
            } else {
                code.write(':');
            }
        } else {
            const parenValue = this.value.hasSpaces(dot);
            if (parenValue) {
                code.write('(');
            }
            this.value.writeScriptText(code, dot, sum);
            if (parenValue) {
                code.write(')');
            }
            if (this.nextOr) {
                code.write(', ');
                this.nextOr.writeScriptText(code, dot, sum);
            } else {
                code.writeLine(':');
                code.indent();
                this.block.writeScriptText(code, dot, sum);
                code.unindent();
            }
            if (this.nextLabel) {
                this.nextLabel.writeScriptText(code, dot, sum);
            }
        }
    }
}

/**
 * OtherwiseNode - otherwise label in case statement
 */
export class OtherwiseNode extends LabelNode {
    constructor() {
        super(NodeType.kOtherwiseNode);
        this.block = new BlockNode();
        this.block.parent = this;
    }

    writeScriptText(code, dot, sum) {
        if (sum) {
            code.write('(case) otherwise:');
        } else {
            code.writeLine('otherwise:');
            code.indent();
            this.block.writeScriptText(code, dot, sum);
            code.unindent();
        }
    }
}

/**
 * EndCaseNode - end case marker
 */
export class EndCaseNode extends LabelNode {
    constructor() {
        super(NodeType.kEndCaseNode);
    }

    writeScriptText(code, dot, sum) {
        code.write('end case');
    }
}

/**
 * CaseStmtNode - case statement
 */
export class CaseStmtNode extends StmtNode {
    constructor(value) {
        super(NodeType.kCaseStmtNode);
        this.value = value;
        this.value.parent = this;
        this.firstLabel = null;
        this.otherwise = null;
        this.endPos = -1;
        this.potentialOtherwisePos = -1;
    }

    writeScriptText(code, dot, sum) {
        code.write('case ');
        this.value.writeScriptText(code, dot, sum);
        code.write(' of');
        if (sum) {
            if (!this.firstLabel) {
                if (this.otherwise) {
                    code.write(' / otherwise:');
                } else {
                    code.write(' / end case');
                }
            }
        } else {
            code.writeLine();
            code.indent();
            if (this.firstLabel) {
                this.firstLabel.writeScriptText(code, dot, sum);
            }
            if (this.otherwise) {
                this.otherwise.writeScriptText(code, dot, sum);
            }
            code.unindent();
            code.write('end case');
        }
    }

    addOtherwise() {
        this.otherwise = new OtherwiseNode();
        this.otherwise.parent = this;
        this.otherwise.block.endPos = this.endPos;
    }
}

/**
 * TellStmtNode - tell statement
 */
export class TellStmtNode extends StmtNode {
    constructor(window) {
        super(NodeType.kTellStmtNode);
        this.window = window;
        this.window.parent = this;
        this.block = new BlockNode();
        this.block.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('tell ');
        this.window.writeScriptText(code, dot, sum);
        if (!sum) {
            code.writeLine();
            code.indent();
            this.block.writeScriptText(code, dot, sum);
            code.unindent();
            code.write('end tell');
        }
    }
}

/**
 * SoundCmdStmtNode - sound command statement
 */
export class SoundCmdStmtNode extends StmtNode {
    constructor(cmd, argList) {
        super(NodeType.kSoundCmdStmtNode);
        this.cmd = cmd;
        this.argList = argList;
        this.argList.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('sound ');
        code.write(this.cmd);
        if (this.argList.getValue().l.length > 0) {
            code.write(' ');
            this.argList.writeScriptText(code, dot, sum);
        }
    }
}

/**
 * PlayCmdStmtNode - play command statement
 */
export class PlayCmdStmtNode extends StmtNode {
    constructor(argList) {
        super(NodeType.kPlayCmdStmtNode);
        this.argList = argList;
        this.argList.parent = this;
    }

    writeScriptText(code, dot, sum) {
        const rawArgs = this.argList.getValue().l;
        code.write('play');

        if (rawArgs.length === 0) {
            code.write(' done');
            return;
        }

        const frame = rawArgs[0];
        if (rawArgs.length === 1) {
            code.write(' frame ');
            frame.writeScriptText(code, dot, sum);
            return;
        }

        const movie = rawArgs[1];
        const frameValue = frame.getValue();
        if (!(frame.type === NodeType.kLiteralNode &&
              frameValue.type === DatumType.kDatumInt &&
              frameValue.i === 1)) {
            code.write(' frame ');
            frame.writeScriptText(code, dot, sum);
            code.write(' of');
        }
        code.write(' movie ');
        movie.writeScriptText(code, dot, sum);
    }
}

/**
 * CallNode - Function call
 */
export class CallNode extends Node {
    constructor(name, argList) {
        super(NodeType.kCallNode);
        this.name = name;
        this.argList = argList;
        this.argList.parent = this;
        if (this.argList.getValue().type === DatumType.kDatumArgListNoRet) {
            this.isStatement = true;
        } else {
            this.isExpression = true;
        }
    }

    noParens() {
        if (this.isStatement) {
            if (this.name === 'put') return true;
            if (this.name === 'return') return true;
        }
        return false;
    }

    isMemberExpr() {
        if (this.isExpression) {
            const nargs = this.argList.getValue().l.length;
            if (this.name === 'cast' && (nargs === 1 || nargs === 2)) return true;
            if (this.name === 'member' && (nargs === 1 || nargs === 2)) return true;
            if (this.name === 'script' && (nargs === 1 || nargs === 2)) return true;
            if (this.name === 'castLib' && nargs === 1) return true;
            if (this.name === 'window' && nargs === 1) return true;
        }
        return false;
    }

    writeScriptText(code, dot, sum) {
        if (this.isExpression && this.argList.getValue().l.length === 0) {
            if (this.name === 'pi') {
                code.write('PI');
                return;
            }
            if (this.name === 'space') {
                code.write('SPACE');
                return;
            }
            if (this.name === 'void') {
                code.write('VOID');
                return;
            }
        }

        if (!dot && this.isMemberExpr()) {
            code.write(this.name);
            code.write(' ');
            const memberID = this.argList.getValue().l[0];
            const parenMemberID = (memberID.type === NodeType.kBinaryOpNode);
            if (parenMemberID) {
                code.write('(');
            }
            memberID.writeScriptText(code, dot, sum);
            if (parenMemberID) {
                code.write(')');
            }
            if (this.argList.getValue().l.length === 2) {
                code.write(' of castLib ');
                const castID = this.argList.getValue().l[1];
                const parenCastID = (castID.type === NodeType.kBinaryOpNode);
                if (parenCastID) {
                    code.write('(');
                }
                castID.writeScriptText(code, dot, sum);
                if (parenCastID) {
                    code.write(')');
                }
            }
            return;
        }

        code.write(this.name);
        if (this.noParens()) {
            code.write(' ');
            this.argList.writeScriptText(code, dot, sum);
        } else {
            code.write('(');
            this.argList.writeScriptText(code, dot, sum);
            code.write(')');
        }
    }

    hasSpaces(dot) {
        if (!dot && this.isMemberExpr()) return true;
        if (this.noParens()) return true;
        return false;
    }
}

/**
 * ObjCallNode - Object method call (obj.method())
 */
export class ObjCallNode extends Node {
    constructor(name, argList) {
        super(NodeType.kObjCallNode);
        this.name = name;
        this.argList = argList;
        this.argList.parent = this;
        if (this.argList.getValue().type === DatumType.kDatumArgListNoRet) {
            this.isStatement = true;
        } else {
            this.isExpression = true;
        }
    }

    writeScriptText(code, dot, sum) {
        const rawArgs = this.argList.getValue().l;
        const obj = rawArgs[0];
        const parenObj = obj.hasSpaces(dot);
        if (parenObj) {
            code.write('(');
        }
        obj.writeScriptText(code, dot, sum);
        if (parenObj) {
            code.write(')');
        }
        code.write('.');
        code.write(this.name);
        code.write('(');
        for (let i = 1; i < rawArgs.length; i++) {
            if (i > 1) {
                code.write(', ');
            }
            rawArgs[i].writeScriptText(code, dot, sum);
        }
        code.write(')');
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * ObjCallV4Node - Director 4 style object call
 */
export class ObjCallV4Node extends Node {
    constructor(obj, argList) {
        super(NodeType.kObjCallV4Node);
        this.obj = obj;
        this.argList = argList;
        this.argList.parent = this;
        if (this.argList.getValue().type === DatumType.kDatumArgListNoRet) {
            this.isStatement = true;
        } else {
            this.isExpression = true;
        }
    }

    writeScriptText(code, dot, sum) {
        this.obj.writeScriptText(code, dot, sum);
        code.write('(');
        this.argList.writeScriptText(code, dot, sum);
        code.write(')');
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * TheExprNode - the <property> expression
 */
export class TheExprNode extends ExprNode {
    constructor(prop) {
        super(NodeType.kTheExprNode);
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        code.write('the ');
        code.write(this.prop);
    }
}

/**
 * LastStringChunkExprNode - the last char/word/item/line of ...
 */
export class LastStringChunkExprNode extends ExprNode {
    constructor(chunkType, obj) {
        super(NodeType.kLastStringChunkExprNode);
        this.chunkType = chunkType;
        this.obj = obj;
        this.obj.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('the last ');
        code.write(StandardNames.getName(StandardNames.chunkTypeNames, this.chunkType));
        code.write(' in ');
        const parenObj = (this.obj.type === NodeType.kBinaryOpNode);
        if (parenObj) {
            code.write('(');
        }
        this.obj.writeScriptText(code, false, sum); // always verbose
        if (parenObj) {
            code.write(')');
        }
    }
}

/**
 * StringChunkCountExprNode - the number of chars/words/items/lines in ...
 */
export class StringChunkCountExprNode extends ExprNode {
    constructor(chunkType, obj) {
        super(NodeType.kStringChunkCountExprNode);
        this.chunkType = chunkType;
        this.obj = obj;
        this.obj.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('the number of ');
        code.write(StandardNames.getName(StandardNames.chunkTypeNames, this.chunkType));
        code.write('s in ');
        const parenObj = (this.obj.type === NodeType.kBinaryOpNode);
        if (parenObj) {
            code.write('(');
        }
        this.obj.writeScriptText(code, false, sum); // always verbose
        if (parenObj) {
            code.write(')');
        }
    }
}

/**
 * MenuPropExprNode - the <prop> of menu ...
 */
export class MenuPropExprNode extends ExprNode {
    constructor(menuID, prop) {
        super(NodeType.kMenuPropExprNode);
        this.menuID = menuID;
        this.menuID.parent = this;
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        code.write('the ');
        code.write(StandardNames.getName(StandardNames.menuPropertyNames, this.prop));
        code.write(' of menu ');
        const parenMenuID = (this.menuID.type === NodeType.kBinaryOpNode);
        if (parenMenuID) {
            code.write('(');
        }
        this.menuID.writeScriptText(code, dot, sum);
        if (parenMenuID) {
            code.write(')');
        }
    }
}

/**
 * MenuItemPropExprNode - the <prop> of menuItem ... of menu ...
 */
export class MenuItemPropExprNode extends ExprNode {
    constructor(menuID, itemID, prop) {
        super(NodeType.kMenuItemPropExprNode);
        this.menuID = menuID;
        this.menuID.parent = this;
        this.itemID = itemID;
        this.itemID.parent = this;
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        code.write('the ');
        code.write(StandardNames.getName(StandardNames.menuItemPropertyNames, this.prop));
        code.write(' of menuItem ');
        const parenItemID = (this.itemID.type === NodeType.kBinaryOpNode);
        if (parenItemID) {
            code.write('(');
        }
        this.itemID.writeScriptText(code, dot, sum);
        if (parenItemID) {
            code.write(')');
        }
        code.write(' of menu ');
        const parenMenuID = (this.menuID.type === NodeType.kBinaryOpNode);
        if (parenMenuID) {
            code.write('(');
        }
        this.menuID.writeScriptText(code, dot, sum);
        if (parenMenuID) {
            code.write(')');
        }
    }
}

/**
 * SoundPropExprNode - the <prop> of sound ...
 */
export class SoundPropExprNode extends ExprNode {
    constructor(soundID, prop) {
        super(NodeType.kSoundPropExprNode);
        this.soundID = soundID;
        this.soundID.parent = this;
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        code.write('the ');
        code.write(StandardNames.getName(StandardNames.soundPropertyNames, this.prop));
        code.write(' of sound ');
        const parenSoundID = (this.soundID.type === NodeType.kBinaryOpNode);
        if (parenSoundID) {
            code.write('(');
        }
        this.soundID.writeScriptText(code, dot, sum);
        if (parenSoundID) {
            code.write(')');
        }
    }
}

/**
 * SpritePropExprNode - the <prop> of sprite ...
 */
export class SpritePropExprNode extends ExprNode {
    constructor(spriteID, prop) {
        super(NodeType.kSpritePropExprNode);
        this.spriteID = spriteID;
        this.spriteID.parent = this;
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        code.write('the ');
        code.write(StandardNames.getName(StandardNames.spritePropertyNames, this.prop));
        code.write(' of sprite ');
        const parenSpriteID = (this.spriteID.type === NodeType.kBinaryOpNode);
        if (parenSpriteID) {
            code.write('(');
        }
        this.spriteID.writeScriptText(code, dot, sum);
        if (parenSpriteID) {
            code.write(')');
        }
    }
}

/**
 * ThePropExprNode - the <prop> of <obj>
 */
export class ThePropExprNode extends ExprNode {
    constructor(obj, prop) {
        super(NodeType.kThePropExprNode);
        this.obj = obj;
        this.obj.parent = this;
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        code.write('the ');
        code.write(this.prop);
        code.write(' of ');
        const parenObj = (this.obj.type === NodeType.kBinaryOpNode);
        if (parenObj) {
            code.write('(');
        }
        this.obj.writeScriptText(code, false, sum); // always verbose
        if (parenObj) {
            code.write(')');
        }
    }
}

/**
 * ObjPropExprNode - obj.prop (dot syntax) or the prop of obj (verbose)
 */
export class ObjPropExprNode extends ExprNode {
    constructor(obj, prop) {
        super(NodeType.kObjPropExprNode);
        this.obj = obj;
        this.obj.parent = this;
        this.prop = prop;
    }

    writeScriptText(code, dot, sum) {
        if (dot) {
            const parenObj = this.obj.hasSpaces(dot);
            if (parenObj) {
                code.write('(');
            }
            this.obj.writeScriptText(code, dot, sum);
            if (parenObj) {
                code.write(')');
            }
            code.write('.');
            code.write(this.prop);
        } else {
            code.write('the ');
            code.write(this.prop);
            code.write(' of ');
            const parenObj = (this.obj.type === NodeType.kBinaryOpNode);
            if (parenObj) {
                code.write('(');
            }
            this.obj.writeScriptText(code, dot, sum);
            if (parenObj) {
                code.write(')');
            }
        }
    }

    hasSpaces(dot) {
        return !dot;
    }
}

/**
 * ObjBracketExprNode - obj[prop]
 */
export class ObjBracketExprNode extends ExprNode {
    constructor(obj, prop) {
        super(NodeType.kObjBracketExprNode);
        this.obj = obj;
        this.obj.parent = this;
        this.prop = prop;
        this.prop.parent = this;
    }

    writeScriptText(code, dot, sum) {
        const parenObj = this.obj.hasSpaces(dot);
        if (parenObj) {
            code.write('(');
        }
        this.obj.writeScriptText(code, dot, sum);
        if (parenObj) {
            code.write(')');
        }
        code.write('[');
        this.prop.writeScriptText(code, dot, sum);
        code.write(']');
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * ObjPropIndexExprNode - obj.prop[index] or obj.prop[index..index2]
 */
export class ObjPropIndexExprNode extends ExprNode {
    constructor(obj, prop, index, index2) {
        super(NodeType.kObjPropIndexExprNode);
        this.obj = obj;
        this.obj.parent = this;
        this.prop = prop;
        this.index = index;
        this.index.parent = this;
        if (index2) {
            this.index2 = index2;
            this.index2.parent = this;
        } else {
            this.index2 = null;
        }
    }

    writeScriptText(code, dot, sum) {
        const parenObj = this.obj.hasSpaces(dot);
        if (parenObj) {
            code.write('(');
        }
        this.obj.writeScriptText(code, dot, sum);
        if (parenObj) {
            code.write(')');
        }
        code.write('.');
        code.write(this.prop);
        code.write('[');
        this.index.writeScriptText(code, dot, sum);
        if (this.index2) {
            code.write('..');
            this.index2.writeScriptText(code, dot, sum);
        }
        code.write(']');
    }

    hasSpaces(dot) {
        return false;
    }
}

/**
 * ExitRepeatStmtNode - exit repeat statement
 */
export class ExitRepeatStmtNode extends StmtNode {
    constructor() {
        super(NodeType.kExitRepeatStmtNode);
    }

    writeScriptText(code, dot, sum) {
        code.write('exit repeat');
    }
}

/**
 * NextRepeatStmtNode - next repeat statement
 */
export class NextRepeatStmtNode extends StmtNode {
    constructor() {
        super(NodeType.kNextRepeatStmtNode);
    }

    writeScriptText(code, dot, sum) {
        code.write('next repeat');
    }
}

/**
 * PutStmtNode - put ... into/after/before statement
 */
export class PutStmtNode extends StmtNode {
    constructor(putType, variable, value) {
        super(NodeType.kPutStmtNode);
        this.putType = putType;
        this.variable = variable;
        this.variable.parent = this;
        this.value = value;
        this.value.parent = this;
    }

    writeScriptText(code, dot, sum) {
        code.write('put ');
        this.value.writeScriptText(code, dot, sum);
        code.write(' ');
        code.write(StandardNames.getName(StandardNames.putTypeNames, this.putType));
        code.write(' ');
        this.variable.writeScriptText(code, false, sum); // always verbose
    }
}

/**
 * WhenStmtNode - when ... then statement
 */
export class WhenStmtNode extends StmtNode {
    constructor(event, script) {
        super(NodeType.kWhenStmtNode);
        this.event = event;
        this.script = script;
    }

    writeScriptText(code, dot, sum) {
        code.write('when ');
        code.write(StandardNames.getName(StandardNames.whenEventNames, this.event));
        code.write(' then');

        code.doIndentation = false;
        for (let i = 0; i < this.script.length; i++) {
            const ch = this.script[i];
            if (ch === '\r') {
                if (i !== this.script.length - 1) {
                    code.writeLine();
                }
            } else {
                code.write(ch);
            }
        }
        code.doIndentation = true;
    }
}

/**
 * NewObjNode - new Object(...) expression
 */
export class NewObjNode extends ExprNode {
    constructor(objType, objArgs) {
        super(NodeType.kNewObjNode);
        this.objType = objType;
        this.objArgs = objArgs;
    }

    writeScriptText(code, dot, sum) {
        code.write('new ');
        code.write(this.objType);
        code.write('(');
        this.objArgs.writeScriptText(code, dot, sum);
        code.write(')');
    }
}

/**
 * AST - Abstract Syntax Tree container
 */
export class AST {
    constructor(handler) {
        this.root = new HandlerNode(handler);
        this.currentBlock = this.root.block;
    }

    writeScriptText(code, dot, sum) {
        this.root.writeScriptText(code, dot, sum);
    }

    addStatement(statement) {
        this.currentBlock.addChild(statement);
    }

    enterBlock(block) {
        this.currentBlock = block;
    }

    exitBlock() {
        const ancestorStatement = this.currentBlock.ancestorStatement();
        if (!ancestorStatement) {
            this.currentBlock = null;
            return;
        }

        const block = ancestorStatement.parent;
        if (!block || block.type !== NodeType.kBlockNode) {
            this.currentBlock = null;
            return;
        }

        this.currentBlock = block;
    }
}
