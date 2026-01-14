/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Endianness } from './lingodec/enums.js';

/**
 * BufferView - A view into a binary buffer
 */
export class BufferView {
    constructor(buffer = null, offset = 0, length = null) {
        if (buffer instanceof ArrayBuffer) {
            this._buffer = buffer;
            this._offset = offset;
            this._length = length !== null ? length : buffer.byteLength - offset;
        } else if (buffer instanceof Uint8Array) {
            this._buffer = buffer.buffer;
            this._offset = buffer.byteOffset + offset;
            this._length = length !== null ? length : buffer.byteLength - offset;
        } else if (buffer instanceof BufferView) {
            this._buffer = buffer._buffer;
            this._offset = buffer._offset + offset;
            this._length = length !== null ? length : buffer._length - offset;
        } else {
            this._buffer = new ArrayBuffer(0);
            this._offset = 0;
            this._length = 0;
        }
    }

    get size() {
        return this._length;
    }

    get data() {
        return new Uint8Array(this._buffer, this._offset, this._length);
    }

    get buffer() {
        return this._buffer;
    }

    get offset() {
        return this._offset;
    }

    get byteOffset() {
        return this._offset;
    }

    get byteLength() {
        return this._length;
    }

    get length() {
        return this._length;
    }
}

/**
 * ReadStream - Binary reading with endianness support
 */
export class ReadStream {
    constructor(buffer, endianness = Endianness.kBigEndian, pos = 0) {
        if (buffer instanceof BufferView) {
            this._view = new BufferView(buffer);
        } else if (buffer instanceof ArrayBuffer) {
            this._view = new BufferView(buffer);
        } else if (buffer instanceof Uint8Array) {
            this._view = new BufferView(buffer);
        } else {
            throw new Error('ReadStream requires ArrayBuffer, Uint8Array, or BufferView');
        }

        this._dataView = new DataView(this._view._buffer, this._view._offset, this._view._length);
        this._pos = pos;
        this.endianness = endianness;
    }

    get pos() {
        return this._pos;
    }

    get size() {
        return this._view.size;
    }

    seek(pos) {
        this._pos = pos;
    }

    skip(offset) {
        this._pos += offset;
    }

    eof() {
        return this._pos >= this._view.size;
    }

    pastEOF() {
        return this._pos > this._view.size;
    }

    /**
     * Read a view into the buffer without copying
     */
    readByteView(len) {
        const view = new BufferView(this._view, this._pos, len);
        this._pos += len;
        return view;
    }

    /**
     * Read bytes into a new Uint8Array
     */
    readBytes(len) {
        if (this._pos + len > this._view.size) {
            throw new Error('ReadStream::readBytes: Read past end of stream!');
        }
        const result = new Uint8Array(len);
        const source = new Uint8Array(this._view._buffer, this._view._offset + this._pos, len);
        result.set(source);
        this._pos += len;
        return result;
    }

    /**
     * Read up to len bytes (may return fewer if at end)
     */
    readUpToBytes(len) {
        if (this.eof()) {
            return new Uint8Array(0);
        }
        const available = Math.min(len, this._view.size - this._pos);
        return this.readBytes(available);
    }

    /**
     * Read and decompress zlib-compressed data
     */
    readZlibBytes(len, destLen) {
        if (this._pos + len > this._view.size) {
            throw new Error('ReadStream::readZlibBytes: Read past end of stream!');
        }

        const compressed = new Uint8Array(this._view._buffer, this._view._offset + this._pos, len);
        this._pos += len;

        // Use pako for decompression
        if (typeof pako === 'undefined') {
            throw new Error('pako library not loaded - required for zlib decompression');
        }

        try {
            return pako.inflate(compressed);
        } catch (e) {
            console.warn('zlib decompression error:', e);
            return null;
        }
    }

    readUint8() {
        if (this._pos + 1 > this._view.size) {
            throw new Error('ReadStream::readUint8: Read past end of stream!');
        }
        const value = this._dataView.getUint8(this._pos);
        this._pos += 1;
        return value;
    }

    readInt8() {
        if (this._pos + 1 > this._view.size) {
            throw new Error('ReadStream::readInt8: Read past end of stream!');
        }
        const value = this._dataView.getInt8(this._pos);
        this._pos += 1;
        return value;
    }

    readUint16() {
        if (this._pos + 2 > this._view.size) {
            throw new Error('ReadStream::readUint16: Read past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        const value = this._dataView.getUint16(this._pos, littleEndian);
        this._pos += 2;
        return value;
    }

    readInt16() {
        if (this._pos + 2 > this._view.size) {
            throw new Error('ReadStream::readInt16: Read past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        const value = this._dataView.getInt16(this._pos, littleEndian);
        this._pos += 2;
        return value;
    }

    readUint32() {
        if (this._pos + 4 > this._view.size) {
            throw new Error('ReadStream::readUint32: Read past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        const value = this._dataView.getUint32(this._pos, littleEndian);
        this._pos += 4;
        return value;
    }

    readInt32() {
        if (this._pos + 4 > this._view.size) {
            throw new Error('ReadStream::readInt32: Read past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        const value = this._dataView.getInt32(this._pos, littleEndian);
        this._pos += 4;
        return value;
    }

    readFloat32() {
        if (this._pos + 4 > this._view.size) {
            throw new Error('ReadStream::readFloat32: Read past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        const value = this._dataView.getFloat32(this._pos, littleEndian);
        this._pos += 4;
        return value;
    }

    readDouble() {
        if (this._pos + 8 > this._view.size) {
            throw new Error('ReadStream::readDouble: Read past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        const value = this._dataView.getFloat64(this._pos, littleEndian);
        this._pos += 8;
        return value;
    }

    /**
     * Read Apple 80-bit SANE extended precision float
     */
    readAppleFloat80() {
        if (this._pos + 10 > this._view.size) {
            throw new Error('ReadStream::readAppleFloat80: Read past end of stream!');
        }

        // Read as big-endian regardless of stream endianness
        const tempView = new DataView(this._view._buffer, this._view._offset + this._pos, 10);
        this._pos += 10;

        let exponent = tempView.getUint16(0, false); // big-endian
        const sign = (exponent & 0x8000) ? 1 : 0;
        exponent &= 0x7fff;

        // Read 64-bit fraction as two 32-bit values (big-endian)
        const fracHi = tempView.getUint32(2, false);
        const fracLo = tempView.getUint32(6, false);

        // Combine into BigInt for precise manipulation
        let fraction = (BigInt(fracHi) << 32n) | BigInt(fracLo);
        fraction &= 0x7fffffffffffffffn;

        let f64exp;
        if (exponent === 0) {
            f64exp = 0n;
        } else if (exponent === 0x7fff) {
            f64exp = 0x7ffn;
        } else {
            const normexp = exponent - 0x3fff;
            if (normexp < -0x3fe || normexp >= 0x3ff) {
                throw new Error('Constant float exponent too big for a double');
            }
            f64exp = BigInt(normexp + 0x3ff);
        }

        const f64sign = BigInt(sign) << 63n;
        f64exp <<= 52n;
        const f64fract = fraction >> 11n;
        const f64bin = f64sign | f64exp | f64fract;

        // Convert BigInt bit pattern to double
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setBigUint64(0, f64bin, false);
        return view.getFloat64(0, false);
    }

    /**
     * Read variable-length integer (7-bit encoding)
     */
    readVarInt() {
        let val = 0;
        let b;
        do {
            b = this.readUint8();
            val = (val << 7) | (b & 0x7f);
        } while (b >> 7);
        return val >>> 0; // Ensure unsigned 32-bit
    }

    /**
     * Read fixed-length string
     */
    readString(len) {
        if (this._pos + len > this._view.size) {
            throw new Error('ReadStream::readString: Read past end of stream!');
        }
        const bytes = new Uint8Array(this._view._buffer, this._view._offset + this._pos, len);
        this._pos += len;

        // Decode as Latin-1 (ISO-8859-1) for Director compatibility
        let result = '';
        for (let i = 0; i < bytes.length; i++) {
            result += String.fromCharCode(bytes[i]);
        }
        return result;
    }

    /**
     * Read null-terminated C string
     */
    readCString() {
        let result = '';
        let ch = this.readInt8();
        while (ch !== 0) {
            result += String.fromCharCode(ch & 0xff);
            ch = this.readInt8();
        }
        return result;
    }

    /**
     * Read Pascal string (length-prefixed)
     */
    readPascalString() {
        const len = this.readUint8();
        return this.readString(len);
    }
}

/**
 * WriteStream - Binary writing with endianness support
 */
export class WriteStream {
    constructor(buffer, endianness = Endianness.kBigEndian, pos = 0) {
        if (buffer instanceof ArrayBuffer) {
            this._buffer = buffer;
            this._offset = 0;
            this._length = buffer.byteLength;
        } else if (buffer instanceof Uint8Array) {
            this._buffer = buffer.buffer;
            this._offset = buffer.byteOffset;
            this._length = buffer.byteLength;
        } else if (typeof buffer === 'number') {
            // Create new buffer of specified size
            this._buffer = new ArrayBuffer(buffer);
            this._offset = 0;
            this._length = buffer;
        } else {
            throw new Error('WriteStream requires ArrayBuffer, Uint8Array, or size number');
        }

        this._dataView = new DataView(this._buffer, this._offset, this._length);
        this._pos = pos;
        this.endianness = endianness;
    }

    get pos() {
        return this._pos;
    }

    get size() {
        return this._length;
    }

    seek(pos) {
        this._pos = pos;
    }

    skip(offset) {
        this._pos += offset;
    }

    pastEOF() {
        return this._pos > this._length;
    }

    writeBytes(data) {
        if (data instanceof BufferView) {
            data = data.data;
        }
        if (this._pos + data.length > this._length) {
            throw new Error('WriteStream::writeBytes: Write past end of stream!');
        }
        const dest = new Uint8Array(this._buffer, this._offset + this._pos, data.length);
        dest.set(data);
        this._pos += data.length;
        return data.length;
    }

    writeUint8(value) {
        if (this._pos + 1 > this._length) {
            throw new Error('WriteStream::writeUint8: Write past end of stream!');
        }
        this._dataView.setUint8(this._pos, value);
        this._pos += 1;
    }

    writeInt8(value) {
        if (this._pos + 1 > this._length) {
            throw new Error('WriteStream::writeInt8: Write past end of stream!');
        }
        this._dataView.setInt8(this._pos, value);
        this._pos += 1;
    }

    writeUint16(value) {
        if (this._pos + 2 > this._length) {
            throw new Error('WriteStream::writeUint16: Write past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        this._dataView.setUint16(this._pos, value, littleEndian);
        this._pos += 2;
    }

    writeInt16(value) {
        if (this._pos + 2 > this._length) {
            throw new Error('WriteStream::writeInt16: Write past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        this._dataView.setInt16(this._pos, value, littleEndian);
        this._pos += 2;
    }

    writeUint32(value) {
        if (this._pos + 4 > this._length) {
            throw new Error('WriteStream::writeUint32: Write past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        this._dataView.setUint32(this._pos, value, littleEndian);
        this._pos += 4;
    }

    writeInt32(value) {
        if (this._pos + 4 > this._length) {
            throw new Error('WriteStream::writeInt32: Write past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        this._dataView.setInt32(this._pos, value, littleEndian);
        this._pos += 4;
    }

    writeDouble(value) {
        if (this._pos + 8 > this._length) {
            throw new Error('WriteStream::writeDouble: Write past end of stream!');
        }
        const littleEndian = this.endianness === Endianness.kLittleEndian;
        this._dataView.setFloat64(this._pos, value, littleEndian);
        this._pos += 8;
    }

    writeString(value) {
        const bytes = new Uint8Array(value.length);
        for (let i = 0; i < value.length; i++) {
            bytes[i] = value.charCodeAt(i) & 0xff;
        }
        this.writeBytes(bytes);
    }

    writePascalString(value) {
        this.writeUint8(value.length);
        this.writeString(value);
    }

    getBuffer() {
        return new Uint8Array(this._buffer, this._offset, this._length);
    }
}
