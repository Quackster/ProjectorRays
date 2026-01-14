/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Bytecode opcodes
export const OpCode = {
    // single-byte
    kOpRet: 0x01,
    kOpRetFactory: 0x02,
    kOpPushZero: 0x03,
    kOpMul: 0x04,
    kOpAdd: 0x05,
    kOpSub: 0x06,
    kOpDiv: 0x07,
    kOpMod: 0x08,
    kOpInv: 0x09,
    kOpJoinStr: 0x0a,
    kOpJoinPadStr: 0x0b,
    kOpLt: 0x0c,
    kOpLtEq: 0x0d,
    kOpNtEq: 0x0e,
    kOpEq: 0x0f,
    kOpGt: 0x10,
    kOpGtEq: 0x11,
    kOpAnd: 0x12,
    kOpOr: 0x13,
    kOpNot: 0x14,
    kOpContainsStr: 0x15,
    kOpContains0Str: 0x16,
    kOpGetChunk: 0x17,
    kOpHiliteChunk: 0x18,
    kOpOntoSpr: 0x19,
    kOpIntoSpr: 0x1a,
    kOpGetField: 0x1b,
    kOpStartTell: 0x1c,
    kOpEndTell: 0x1d,
    kOpPushList: 0x1e,
    kOpPushPropList: 0x1f,
    kOpSwap: 0x21,

    // multi-byte
    kOpPushInt8: 0x41,
    kOpPushArgListNoRet: 0x42,
    kOpPushArgList: 0x43,
    kOpPushCons: 0x44,
    kOpPushSymb: 0x45,
    kOpPushVarRef: 0x46,
    kOpGetGlobal2: 0x48,
    kOpGetGlobal: 0x49,
    kOpGetProp: 0x4a,
    kOpGetParam: 0x4b,
    kOpGetLocal: 0x4c,
    kOpSetGlobal2: 0x4e,
    kOpSetGlobal: 0x4f,
    kOpSetProp: 0x50,
    kOpSetParam: 0x51,
    kOpSetLocal: 0x52,
    kOpJmp: 0x53,
    kOpEndRepeat: 0x54,
    kOpJmpIfZ: 0x55,
    kOpLocalCall: 0x56,
    kOpExtCall: 0x57,
    kOpObjCallV4: 0x58,
    kOpPut: 0x59,
    kOpPutChunk: 0x5a,
    kOpDeleteChunk: 0x5b,
    kOpGet: 0x5c,
    kOpSet: 0x5d,
    kOpGetMovieProp: 0x5f,
    kOpSetMovieProp: 0x60,
    kOpGetObjProp: 0x61,
    kOpSetObjProp: 0x62,
    kOpTellCall: 0x63,
    kOpPeek: 0x64,
    kOpPop: 0x65,
    kOpTheBuiltin: 0x66,
    kOpObjCall: 0x67,
    kOpPushChunkVarRef: 0x6d,
    kOpPushInt16: 0x6e,
    kOpPushInt32: 0x6f,
    kOpGetChainedProp: 0x70,
    kOpPushFloat32: 0x71,
    kOpGetTopLevelProp: 0x72,
    kOpNewObj: 0x73
};

// Reverse lookup for opcode names
export const OpCodeNames = {};
for (const [name, value] of Object.entries(OpCode)) {
    OpCodeNames[value] = name;
}

// Datum types for literal values
export const DatumType = {
    kDatumVoid: 0,
    kDatumSymbol: 1,
    kDatumVarRef: 2,
    kDatumString: 3,
    kDatumInt: 4,
    kDatumFloat: 5,
    kDatumList: 6,
    kDatumArgList: 7,
    kDatumArgListNoRet: 8,
    kDatumPropList: 9
};

// Chunk expression types (char, word, item, line)
export const ChunkExprType = {
    kChunkChar: 0x01,
    kChunkWord: 0x02,
    kChunkItem: 0x03,
    kChunkLine: 0x04
};

// Put statement types
export const PutType = {
    kPutInto: 0x01,
    kPutAfter: 0x02,
    kPutBefore: 0x03
};

// AST node types
export const NodeType = {
    kNoneNode: 0,
    kErrorNode: 1,
    kTempNode: 2,
    kCommentNode: 3,
    kLiteralNode: 4,
    kBlockNode: 5,
    kHandlerNode: 6,
    kExitStmtNode: 7,
    kInverseOpNode: 8,
    kNotOpNode: 9,
    kBinaryOpNode: 10,
    kChunkExprNode: 11,
    kChunkHiliteStmtNode: 12,
    kChunkDeleteStmtNode: 13,
    kSpriteIntersectsExprNode: 14,
    kSpriteWithinExprNode: 15,
    kMemberExprNode: 16,
    kVarNode: 17,
    kAssignmentStmtNode: 18,
    kIfStmtNode: 19,
    kRepeatWhileStmtNode: 20,
    kRepeatWithInStmtNode: 21,
    kRepeatWithToStmtNode: 22,
    kCaseStmtNode: 23,
    kCaseLabelNode: 24,
    kOtherwiseNode: 25,
    kEndCaseNode: 26,
    kTellStmtNode: 27,
    kSoundCmdStmtNode: 28,
    kPlayCmdStmtNode: 29,
    kCallNode: 30,
    kObjCallNode: 31,
    kObjCallV4Node: 32,
    kTheExprNode: 33,
    kLastStringChunkExprNode: 34,
    kStringChunkCountExprNode: 35,
    kMenuPropExprNode: 36,
    kMenuItemPropExprNode: 37,
    kSoundPropExprNode: 38,
    kSpritePropExprNode: 39,
    kThePropExprNode: 40,
    kObjPropExprNode: 41,
    kObjBracketExprNode: 42,
    kObjPropIndexExprNode: 43,
    kExitRepeatStmtNode: 44,
    kNextRepeatStmtNode: 45,
    kPutStmtNode: 46,
    kWhenStmtNode: 47,
    kNewObjNode: 48
};

// Bytecode tags for control flow analysis
export const BytecodeTag = {
    kTagNone: 0,
    kTagSkip: 1,
    kTagRepeatWhile: 2,
    kTagRepeatWithIn: 3,
    kTagRepeatWithTo: 4,
    kTagRepeatWithDownTo: 5,
    kTagNextRepeatTarget: 6,
    kTagEndCase: 7
};

// Case statement expectations
export const CaseExpect = {
    kCaseExpectEnd: 0,
    kCaseExpectOr: 1,
    kCaseExpectNext: 2,
    kCaseExpectOtherwise: 3
};

// Script flags
export const ScriptFlag = {
    kScriptFlagUnused: (1 << 0x0),
    kScriptFlagFuncsGlobal: (1 << 0x1),
    kScriptFlagVarsGlobal: (1 << 0x2),
    kScriptFlagUnk3: (1 << 0x3),
    kScriptFlagFactoryDef: (1 << 0x4),
    kScriptFlagUnk5: (1 << 0x5),
    kScriptFlagUnk6: (1 << 0x6),
    kScriptFlagUnk7: (1 << 0x7),
    kScriptFlagHasFactory: (1 << 0x8),
    kScriptFlagEventScript: (1 << 0x9),
    kScriptFlagEventScript2: (1 << 0xa),
    kScriptFlagUnkB: (1 << 0xb),
    kScriptFlagUnkC: (1 << 0xc),
    kScriptFlagUnkD: (1 << 0xd),
    kScriptFlagUnkE: (1 << 0xe),
    kScriptFlagUnkF: (1 << 0xf)
};

// Literal types in constant pool
export const LiteralType = {
    kLiteralString: 1,
    kLiteralInt: 4,
    kLiteralFloat: 9
};

// FOURCC helper function
export function FOURCC(a, b, c, d) {
    return ((a.charCodeAt(0) << 24) |
            (b.charCodeAt(0) << 16) |
            (c.charCodeAt(0) << 8) |
            d.charCodeAt(0)) >>> 0;
}

// Convert FOURCC to string
export function fourCCToString(fourCC) {
    return String.fromCharCode(
        (fourCC >> 24) & 0xFF,
        (fourCC >> 16) & 0xFF,
        (fourCC >> 8) & 0xFF,
        fourCC & 0xFF
    );
}

// Endianness constants
export const Endianness = {
    kBigEndian: 0,
    kLittleEndian: 1
};

// Cast member types
export const CastType = {
    kCastTypeNull: 0,
    kCastTypeBitmap: 1,
    kCastTypeFilmLoop: 2,
    kCastTypeText: 3,
    kCastTypePalette: 4,
    kCastTypePicture: 5,
    kCastTypeSound: 6,
    kCastTypeButton: 7,
    kCastTypeShape: 8,
    kCastTypeMovie: 9,
    kCastTypeDigitalVideo: 10,
    kCastTypeScript: 11,
    kCastTypeRTE: 12,
    kCastTypeOLE: 13,
    kCastTypeTransition: 14,
    kCastTypeXtra: 15
};

// Script types
export const ScriptType = {
    kScoreScript: 1,
    kMovieScript: 3,
    kParentScript: 7
};
