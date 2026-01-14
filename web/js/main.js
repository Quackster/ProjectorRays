/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { DirectorFile } from './director/dirfile.js';
import { MemberType } from './director/chunk.js';
import { FOURCC } from './lingodec/enums.js';

// Global state
let currentFile = null;
let currentFileBuffer = null;
let currentDirFile = null;
let scripts = [];
let assets = [];
let selectedScript = null;
let selectedAsset = null;
let currentTab = 'scripts';

// DOM elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const loadingSection = document.getElementById('loading-section');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const errorDismiss = document.getElementById('error-dismiss');
const contentSection = document.getElementById('content-section');
const scriptList = document.getElementById('script-list');
const assetList = document.getElementById('asset-list');
const codeDisplay = document.getElementById('code-display').querySelector('code');
const currentScriptName = document.getElementById('current-script-name');
const dotSyntaxCheckbox = document.getElementById('dot-syntax');
const copyBtn = document.getElementById('copy-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const codePanel = document.getElementById('code-panel');
const assetPanel = document.getElementById('asset-panel');
const currentAssetName = document.getElementById('current-asset-name');
const downloadAssetBtn = document.getElementById('download-asset-btn');
const assetInfo = document.getElementById('asset-info');
const assetCanvas = document.getElementById('asset-canvas');
const assetText = document.getElementById('asset-text');
const assetBinary = document.getElementById('asset-binary');

// Member type names
const MemberTypeNames = {
    [MemberType.kNullMember]: 'Null',
    [MemberType.kBitmapMember]: 'Bitmap',
    [MemberType.kFilmLoopMember]: 'Film Loop',
    [MemberType.kTextMember]: 'Text',
    [MemberType.kPaletteMember]: 'Palette',
    [MemberType.kPictureMember]: 'Picture',
    [MemberType.kSoundMember]: 'Sound',
    [MemberType.kButtonMember]: 'Button',
    [MemberType.kShapeMember]: 'Shape',
    [MemberType.kMovieMember]: 'Movie',
    [MemberType.kDigitalVideoMember]: 'Digital Video',
    [MemberType.kScriptMember]: 'Script',
    [MemberType.kRTEMember]: 'Rich Text'
};

// Initialize
function init() {
    // File input events
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop events
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);

    // Button events
    downloadBtn.addEventListener('click', downloadFile);
    clearBtn.addEventListener('click', clearFile);
    errorDismiss.addEventListener('click', dismissError);
    copyBtn.addEventListener('click', copyCode);
    downloadAssetBtn.addEventListener('click', downloadAsset);

    // Dot syntax toggle
    dotSyntaxCheckbox.addEventListener('change', refreshCodeDisplay);

    // Tab switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tab) {
    currentTab = tab;

    // Update tab buttons
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab contents
    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tab}-tab`);
    });

    // Update right panel
    if (tab === 'scripts') {
        codePanel.classList.remove('hidden');
        assetPanel.classList.add('hidden');
    } else {
        codePanel.classList.add('hidden');
        assetPanel.classList.remove('hidden');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

async function processFile(file) {
    showLoading();
    hideError();
    hideContent();

    try {
        currentFileBuffer = await file.arrayBuffer();
        currentFile = file;

        // Parse the Director file
        currentDirFile = new DirectorFile();
        currentDirFile.read(currentFileBuffer);

        // Parse all scripts (decompile bytecode to AST)
        currentDirFile.parseScripts();

        // Extract scripts and assets
        scripts = [];
        assets = [];
        extractScripts(currentDirFile);
        extractAssets(currentDirFile);

        // Show the UI
        showFileInfo(file.name);
        populateScriptList();
        populateAssetList();
        showContent();

        if (scripts.length > 0) {
            selectScript(0);
        }
    } catch (error) {
        console.error('Error processing file:', error);
        showError(error.message || 'Failed to process file');
    } finally {
        hideLoading();
    }
}

function extractScripts(dirFile) {
    // Get all script chunks from the file
    for (const scriptChunk of dirFile.scriptChunks) {
        if (scriptChunk.script) {
            scripts.push({
                name: getScriptName(scriptChunk),
                type: getScriptType(scriptChunk),
                script: scriptChunk.script,
                chunk: scriptChunk
            });
        }
    }

    // Sort by name
    scripts.sort((a, b) => a.name.localeCompare(b.name));
}

function extractAssets(dirFile) {
    // Get all cast members from all casts
    for (const cast of dirFile.casts) {
        for (const [memberId, member] of cast.members) {
            // Skip script members (they're shown in Scripts tab)
            if (member.type === MemberType.kScriptMember) continue;
            // Skip null members
            if (member.type === MemberType.kNullMember) continue;

            const asset = {
                id: memberId,
                name: member.getName() || `Member ${memberId}`,
                type: member.type,
                typeName: MemberTypeNames[member.type] || 'Unknown',
                member: member,
                cast: cast,
                castName: cast.name
            };

            // Try to find associated data chunk (BITD for bitmaps, snd for sounds, etc.)
            asset.dataChunkId = findAssetDataChunk(dirFile, cast, memberId, member.type);

            assets.push(asset);
        }
    }

    // Sort by ID
    assets.sort((a, b) => a.id - b.id);
}

function findAssetDataChunk(dirFile, cast, memberId, memberType) {
    // Look in key table for associated data chunks
    const keyTable = dirFile.keyTable;
    if (!keyTable) return null;

    // Find the cast's ID
    let castId = 1024; // Default internal cast ID
    for (const castEntry of dirFile.casts) {
        if (castEntry === cast) break;
    }

    // Map member types to their data chunk FOURCCs
    const dataChunkMap = {
        [MemberType.kBitmapMember]: FOURCC('B', 'I', 'T', 'D'),
        [MemberType.kSoundMember]: FOURCC('s', 'n', 'd', ' '),
        [MemberType.kTextMember]: FOURCC('S', 'T', 'X', 'T'),
        [MemberType.kPaletteMember]: FOURCC('C', 'L', 'U', 'T'),
        [MemberType.kShapeMember]: FOURCC('S', 'H', 'A', 'P'),
    };

    const targetFourCC = dataChunkMap[memberType];
    if (!targetFourCC) return null;

    // Search key table for matching entry
    for (const entry of keyTable.entries) {
        if (entry.castID === memberId && entry.fourCC === targetFourCC) {
            return entry.sectionID;
        }
    }

    return null;
}

function getScriptName(scriptChunk) {
    const script = scriptChunk.script;
    if (script.factoryName) {
        return script.factoryName;
    }
    if (script.handlers.length > 0 && script.handlers[0].name) {
        return script.handlers[0].name;
    }
    return 'Script ' + script.scriptNumber;
}

function getScriptType(scriptChunk) {
    const script = scriptChunk.script;
    if (script.isFactory()) {
        return 'Factory';
    }
    const flags = script.scriptFlags;
    if (flags & 0x200) { // kScriptFlagEventScript
        return 'Event';
    }
    return 'Script';
}

function populateScriptList() {
    scriptList.innerHTML = '';

    for (let i = 0; i < scripts.length; i++) {
        const scriptInfo = scripts[i];
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="script-name">${escapeHtml(scriptInfo.name)}</span>
            <span class="script-type">${escapeHtml(scriptInfo.type)}</span>
        `;
        li.addEventListener('click', () => selectScript(i));
        scriptList.appendChild(li);
    }
}

function populateAssetList() {
    assetList.innerHTML = '';

    for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="asset-name">${escapeHtml(asset.name)}</span>
            <span class="asset-type">${escapeHtml(asset.typeName)}</span>
            <span class="asset-id">#${asset.id}</span>
        `;
        li.addEventListener('click', () => selectAsset(i));
        assetList.appendChild(li);
    }
}

function selectScript(index) {
    if (index < 0 || index >= scripts.length) return;

    // Update selection in list
    const items = scriptList.querySelectorAll('li');
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
    });

    selectedScript = scripts[index];
    currentScriptName.textContent = selectedScript.name;
    copyBtn.classList.remove('hidden');

    refreshCodeDisplay();
}

function selectAsset(index) {
    if (index < 0 || index >= assets.length) return;

    // Update selection in list
    const items = assetList.querySelectorAll('li');
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
    });

    selectedAsset = assets[index];
    currentAssetName.textContent = selectedAsset.name;
    downloadAssetBtn.classList.remove('hidden');

    refreshAssetDisplay();
}

function refreshCodeDisplay() {
    if (!selectedScript) {
        codeDisplay.textContent = '';
        return;
    }

    const dotSyntax = dotSyntaxCheckbox.checked;

    try {
        const code = selectedScript.script.scriptText('\n', dotSyntax);
        codeDisplay.textContent = code;
    } catch (error) {
        console.error('Error generating script text:', error);
        codeDisplay.textContent = '-- Error generating script text: ' + error.message;
    }
}

function refreshAssetDisplay() {
    if (!selectedAsset) {
        assetInfo.innerHTML = '';
        return;
    }

    // Hide all preview elements
    assetCanvas.classList.add('hidden');
    assetText.classList.add('hidden');
    assetBinary.classList.add('hidden');

    // Show asset info
    let infoHtml = `
        <p><strong>Name:</strong> ${escapeHtml(selectedAsset.name)}</p>
        <p><strong>Type:</strong> ${escapeHtml(selectedAsset.typeName)}</p>
        <p><strong>Member ID:</strong> ${selectedAsset.id}</p>
        <p><strong>Cast:</strong> ${escapeHtml(selectedAsset.castName)}</p>
    `;

    // Add specific data based on member type
    const member = selectedAsset.member;
    if (member.specificData && member.specificData.length > 0) {
        infoHtml += `<p><strong>Data Size:</strong> ${member.specificData.length} bytes</p>`;
    }

    assetInfo.innerHTML = infoHtml;

    // Try to display the asset based on type
    switch (selectedAsset.type) {
        case MemberType.kBitmapMember:
            displayBitmap(selectedAsset);
            break;
        case MemberType.kTextMember:
        case MemberType.kRTEMember:
            displayText(selectedAsset);
            break;
        default:
            displayBinaryData(selectedAsset);
            break;
    }
}

function displayBitmap(asset) {
    const member = asset.member;

    // Parse bitmap-specific data
    if (!member.specificData || member.specificData.length < 16) {
        assetBinary.innerHTML = '<p>No bitmap data available</p>';
        assetBinary.classList.remove('hidden');
        return;
    }

    // Read bitmap properties from specificData
    const data = member.specificData;
    // Handle BufferView or raw data
    let view;
    if (data.buffer && data.byteOffset !== undefined) {
        view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof ArrayBuffer) {
        view = new DataView(data);
    } else {
        view = new DataView(data.buffer || data);
    }

    try {
        // Bitmap specific data format (big endian):
        // Varies by version, but generally contains:
        // - totalWidth, initialRect, boundingRect, regPoint, bitDepth, etc.

        let offset = 0;
        let totalWidth = 0;
        let height = 0;
        let width = 0;
        let bitDepth = 1;

        if (currentDirFile.version >= 500) {
            // D5+ format
            // Read as many values as we can
            if (data.length >= 2) {
                // Different parsing for D5+
                // The format varies, let's try to extract dimensions
                const firstShort = view.getUint16(0, false);
                if (data.length >= 18) {
                    // Try to read bounding rect
                    const top = view.getInt16(2, false);
                    const left = view.getInt16(4, false);
                    const bottom = view.getInt16(6, false);
                    const right = view.getInt16(8, false);
                    width = right - left;
                    height = bottom - top;

                    if (data.length >= 20) {
                        bitDepth = view.getUint16(18, false);
                    }
                }
            }
        } else {
            // D4 and earlier
            if (data.length >= 14) {
                totalWidth = view.getUint16(0, false);
                const top = view.getInt16(2, false);
                const left = view.getInt16(4, false);
                const bottom = view.getInt16(6, false);
                const right = view.getInt16(8, false);
                width = right - left;
                height = bottom - top;
                bitDepth = view.getUint8(13);
            }
        }

        // Update info with dimensions
        assetInfo.innerHTML += `
            <p><strong>Dimensions:</strong> ${width} x ${height}</p>
            <p><strong>Bit Depth:</strong> ${bitDepth}</p>
        `;

        // Try to get and display the actual bitmap data (BITD chunk)
        if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('B', 'I', 'T', 'D'), asset.dataChunkId)) {
            try {
                const bitdData = currentDirFile.getChunkData(FOURCC('B', 'I', 'T', 'D'), asset.dataChunkId);
                renderBitmapToCanvas(bitdData, width, height, bitDepth);
            } catch (e) {
                console.error('Error loading BITD chunk:', e);
                displayBinaryData(asset);
            }
        } else {
            assetInfo.innerHTML += `<p><strong>Note:</strong> Bitmap data chunk not found</p>`;
            displayBinaryData(asset);
        }
    } catch (e) {
        console.error('Error parsing bitmap:', e);
        displayBinaryData(asset);
    }
}

function renderBitmapToCanvas(data, width, height, bitDepth) {
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        assetBinary.innerHTML = '<p>Invalid bitmap dimensions</p>';
        assetBinary.classList.remove('hidden');
        return;
    }

    const canvas = assetCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Get raw bytes from the data view
    const bytes = toUint8Array(data);

    // Director bitmaps can be RLE compressed or raw
    // For simplicity, we'll try to display raw data first
    let srcOffset = 0;

    try {
        if (bitDepth === 1) {
            // 1-bit bitmap (black and white)
            const bytesPerRow = Math.ceil(width / 8);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const byteIndex = y * bytesPerRow + Math.floor(x / 8);
                    const bitIndex = 7 - (x % 8);
                    const bit = (bytes[byteIndex] >> bitIndex) & 1;
                    const color = bit ? 0 : 255;
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = color;
                    pixels[dstOffset + 1] = color;
                    pixels[dstOffset + 2] = color;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 8) {
            // 8-bit indexed (we'll use grayscale since we don't have the palette)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const color = bytes[y * width + x] || 0;
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = color;
                    pixels[dstOffset + 1] = color;
                    pixels[dstOffset + 2] = color;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 16) {
            // 16-bit RGB (555 or 565)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset = (y * width + x) * 2;
                    const pixel = (bytes[offset] << 8) | bytes[offset + 1];
                    // Assume RGB555
                    const r = ((pixel >> 10) & 0x1F) << 3;
                    const g = ((pixel >> 5) & 0x1F) << 3;
                    const b = (pixel & 0x1F) << 3;
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 24 || bitDepth === 32) {
            // 24-bit or 32-bit RGB(A)
            const bytesPerPixel = bitDepth / 8;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset = (y * width + x) * bytesPerPixel;
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = bytes[offset] || 0;
                    pixels[dstOffset + 1] = bytes[offset + 1] || 0;
                    pixels[dstOffset + 2] = bytes[offset + 2] || 0;
                    pixels[dstOffset + 3] = bytesPerPixel === 4 ? (bytes[offset + 3] || 255) : 255;
                }
            }
        } else {
            throw new Error(`Unsupported bit depth: ${bitDepth}`);
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.classList.remove('hidden');
    } catch (e) {
        console.error('Error rendering bitmap:', e);
        assetInfo.innerHTML += `<p><strong>Error:</strong> ${e.message}</p>`;
        displayHexDump(bytes, 256);
    }
}

function displayText(asset) {
    const member = asset.member;

    // Try to get text from STXT chunk
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('S', 'T', 'X', 'T'), asset.dataChunkId)) {
        try {
            const stxtData = currentDirFile.getChunkData(FOURCC('S', 'T', 'X', 'T'), asset.dataChunkId);
            // STXT format: header + text data
            const bytes = toUint8Array(stxtData);

            // Simple text extraction (skip header)
            let textStart = 12; // Typical header size
            let text = '';
            for (let i = textStart; i < bytes.length; i++) {
                if (bytes[i] >= 32 && bytes[i] < 127) {
                    text += String.fromCharCode(bytes[i]);
                } else if (bytes[i] === 13 || bytes[i] === 10) {
                    text += '\n';
                }
            }

            assetText.textContent = text || '(Empty text)';
            assetText.classList.remove('hidden');
            return;
        } catch (e) {
            console.error('Error loading text:', e);
        }
    }

    // Fall back to displaying raw data
    displayBinaryData(asset);
}

function displayBinaryData(asset) {
    const member = asset.member;

    if (!member.specificData || member.specificData.length === 0) {
        assetBinary.innerHTML = '<p>No specific data available</p>';
        assetBinary.classList.remove('hidden');
        return;
    }

    const bytes = toUint8Array(member.specificData);
    displayHexDump(bytes, 512);
}

function displayHexDump(bytes, maxBytes) {
    const limit = Math.min(bytes.length, maxBytes);
    let html = '';

    for (let i = 0; i < limit; i += 16) {
        const offset = i.toString(16).padStart(6, '0');
        let hexPart = '';
        let asciiPart = '';

        for (let j = 0; j < 16; j++) {
            if (i + j < limit) {
                const byte = bytes[i + j];
                hexPart += byte.toString(16).padStart(2, '0') + ' ';
                asciiPart += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
            } else {
                hexPart += '   ';
            }
        }

        html += `<div class="hex-row">
            <span class="hex-offset">${offset}</span>
            <span class="hex-bytes">${hexPart}</span>
            <span class="hex-ascii">${asciiPart}</span>
        </div>`;
    }

    if (bytes.length > maxBytes) {
        html += `<div class="hex-row"><span class="hex-offset">...</span><span class="hex-bytes">${bytes.length - maxBytes} more bytes</span></div>`;
    }

    assetBinary.innerHTML = html;
    assetBinary.classList.remove('hidden');
}

function copyCode() {
    const code = codeDisplay.textContent;
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

function downloadAsset() {
    if (!selectedAsset) return;

    const member = selectedAsset.member;
    let data = null;
    let filename = selectedAsset.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    let mimeType = 'application/octet-stream';

    // Try to get the actual asset data
    if (selectedAsset.dataChunkId) {
        const chunkFourCCs = {
            [MemberType.kBitmapMember]: FOURCC('B', 'I', 'T', 'D'),
            [MemberType.kSoundMember]: FOURCC('s', 'n', 'd', ' '),
            [MemberType.kTextMember]: FOURCC('S', 'T', 'X', 'T'),
        };

        const fourCC = chunkFourCCs[selectedAsset.type];
        if (fourCC && currentDirFile.chunkExists(fourCC, selectedAsset.dataChunkId)) {
            try {
                const chunkData = currentDirFile.getChunkData(fourCC, selectedAsset.dataChunkId);
                data = toUint8Array(chunkData);

                // Set appropriate extension
                switch (selectedAsset.type) {
                    case MemberType.kBitmapMember:
                        filename += '.bitd';
                        break;
                    case MemberType.kSoundMember:
                        filename += '.snd';
                        mimeType = 'audio/basic';
                        break;
                    case MemberType.kTextMember:
                        filename += '.txt';
                        mimeType = 'text/plain';
                        break;
                }
            } catch (e) {
                console.error('Error getting asset data:', e);
            }
        }
    }

    // Fall back to specific data if no chunk data
    if (!data && member.specificData) {
        data = toUint8Array(member.specificData);
        filename += '.dat';
    }

    if (!data) {
        alert('No data available for download');
        return;
    }

    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadFile() {
    if (!currentFile || !currentFileBuffer) return;

    const blob = new Blob([currentFileBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearFile() {
    currentFile = null;
    currentFileBuffer = null;
    currentDirFile = null;
    scripts = [];
    assets = [];
    selectedScript = null;
    selectedAsset = null;

    fileInput.value = '';
    scriptList.innerHTML = '';
    assetList.innerHTML = '';
    codeDisplay.textContent = '';
    currentScriptName.textContent = 'Select a script';
    currentAssetName.textContent = 'Select an asset';
    copyBtn.classList.add('hidden');
    downloadAssetBtn.classList.add('hidden');
    assetInfo.innerHTML = '';
    assetCanvas.classList.add('hidden');
    assetText.classList.add('hidden');
    assetBinary.classList.add('hidden');

    hideFileInfo();
    hideContent();
    hideError();

    // Reset to scripts tab
    switchTab('scripts');
}

// UI visibility helpers
function showLoading() {
    loadingSection.classList.remove('hidden');
}

function hideLoading() {
    loadingSection.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.classList.remove('hidden');
}

function hideError() {
    errorSection.classList.add('hidden');
}

function dismissError() {
    hideError();
}

function showContent() {
    contentSection.classList.remove('hidden');
}

function hideContent() {
    contentSection.classList.add('hidden');
}

function showFileInfo(name) {
    fileName.textContent = name;
    downloadBtn.classList.remove('hidden');
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
}

function hideFileInfo() {
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
}

// Utility
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function toUint8Array(data) {
    if (data instanceof Uint8Array) {
        return data;
    }
    if (data.buffer && data.byteOffset !== undefined) {
        // BufferView
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    // Fallback
    return new Uint8Array(data.buffer || data);
}

// Start the application
init();
