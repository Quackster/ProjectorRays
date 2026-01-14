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

    // Palette selector change event - re-render bitmap with new palette
    const paletteTypeSelect = document.getElementById('palette-type');
    if (paletteTypeSelect) {
        paletteTypeSelect.addEventListener('change', () => {
            if (selectedAsset && selectedAsset.member && selectedAsset.member.type === MemberType.kBitmapMember) {
                // Clear existing info except palette selector
                assetInfo.innerHTML = '';
                assetCanvas.classList.add('hidden');
                assetText.classList.add('hidden');
                assetBinary.classList.add('hidden');
                // Re-display the bitmap with new palette
                displayAssetInfo(selectedAsset);
                displayBitmap(selectedAsset);
            }
        });
    }
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
    // Debug: Log key table contents
    if (dirFile.keyTable) {
        console.log('Key table has', dirFile.keyTable.entries.length, 'entries');
        const bitdFourCC = FOURCC('B', 'I', 'T', 'D');
        console.log('Looking for BITD fourCC:', bitdFourCC.toString(16));
        const bitdEntries = dirFile.keyTable.entries.filter(e => e.fourCC === bitdFourCC);
        console.log('BITD entries found:', bitdEntries.length);
        if (bitdEntries.length === 0 && dirFile.keyTable.entries.length > 0) {
            // Show some fourCC values to debug
            const sampleFourCCs = dirFile.keyTable.entries.slice(0, 10).map(e => ({
                fourCC: e.fourCC.toString(16),
                castID: e.castID,
                sectionID: e.sectionID
            }));
            console.log('Sample key table entries (fourCC in hex):', sampleFourCCs);
        }
        if (bitdEntries.length > 0) {
            console.log('First 10 BITD entries:', bitdEntries.slice(0, 10).map(e => ({
                castID: e.castID,
                sectionID: e.sectionID
            })));
        }
    }

    // Get all cast members from all casts
    for (const cast of dirFile.casts) {
        console.log('Cast:', cast.name, 'members:', cast.members.size);
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
            asset.dataChunkId = findAssetDataChunk(dirFile, cast, memberId, member.type, member);

            assets.push(asset);
        }
    }

    // Sort by ID
    assets.sort((a, b) => a.id - b.id);
}

function findAssetDataChunk(dirFile, cast, memberId, memberType, member) {
    // Look in key table for associated data chunks
    const keyTable = dirFile.keyTable;
    if (!keyTable) {
        console.log('findAssetDataChunk: no keyTable');
        return null;
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

    // Get different IDs to try
    const slotID = memberId;  // Slot index in cast (member.id = i + minMember)
    const castSectionID = member?.castSectionID;  // CASt chunk's section ID
    const castLibID = member?.castLibID;  // Cast library ID (1024)

    // Try matching by slot ID first (most common for member data)
    for (const entry of keyTable.entries) {
        if (entry.castID === slotID && entry.fourCC === targetFourCC) {
            console.log('findAssetDataChunk: found by slotID', slotID, '-> sectionID', entry.sectionID);
            return entry.sectionID;
        }
    }

    // Try matching by CASt chunk section ID
    if (castSectionID) {
        for (const entry of keyTable.entries) {
            if (entry.castID === castSectionID && entry.fourCC === targetFourCC) {
                console.log('findAssetDataChunk: found by castSectionID', castSectionID, '-> sectionID', entry.sectionID);
                return entry.sectionID;
            }
        }
    }

    // Debug: show what we're looking for
    if (memberType === MemberType.kBitmapMember) {
        console.log('findAssetDataChunk: no BITD entry found for member', memberId);
        console.log('  slotID:', slotID, 'castSectionID:', castSectionID, 'castLibID:', castLibID);
        const bitdEntries = keyTable.entries.filter(e => e.fourCC === targetFourCC).slice(0, 5);
        console.log('  sample BITD entries:', bitdEntries.map(e => ({ castID: e.castID, sectionID: e.sectionID })));
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

    // Hide palette selector by default (will be shown for bitmap assets)
    const paletteSelector = document.getElementById('palette-selector');
    if (paletteSelector) {
        paletteSelector.classList.add('hidden');
    }

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
        case MemberType.kShapeMember:
            displayShape(selectedAsset);
            break;
        case MemberType.kButtonMember:
            displayButton(selectedAsset);
            break;
        case MemberType.kPaletteMember:
            displayPalette(selectedAsset);
            break;
        case MemberType.kSoundMember:
            displaySound(selectedAsset);
            break;
        case MemberType.kFilmLoopMember:
            displayFilmLoop(selectedAsset);
            break;
        default:
            displayBinaryData(selectedAsset);
            break;
    }
}

// Default Mac system palette (256 colors) - commonly used in Director
const MAC_PALETTE = generateMacPalette();

function generateMacPalette() {
    const palette = new Array(256);
    // Generate a reasonable approximation of the Mac system palette
    // This is the standard 8-bit color cube + grays
    for (let i = 0; i < 256; i++) {
        if (i < 216) {
            // 6x6x6 color cube
            const r = Math.floor(i / 36) * 51;
            const g = Math.floor((i % 36) / 6) * 51;
            const b = (i % 6) * 51;
            palette[i] = [r, g, b];
        } else {
            // Grayscale ramp for remaining colors
            const gray = Math.floor((i - 216) * 255 / 39);
            palette[i] = [gray, gray, gray];
        }
    }
    // Override some common indices
    palette[0] = [255, 255, 255];   // White
    palette[255] = [0, 0, 0];       // Black
    return palette;
}

// Greyscale palette from PhotoRenderer (for Habbo/Shockwave photos)
// This is the specific 256-entry grayscale palette used by Director for grayscale images
const GREYSCALE_PALETTE = [
    [255,255,255],[254,254,254],[255,255,255],[253,253,253],[252,252,252],
    [251,251,251],[250,250,250],[249,249,249],[248,248,248],[247,247,247],
    [246,246,246],[245,245,245],[244,244,244],[243,243,243],[255,255,255],
    [242,242,242],[241,241,241],[240,240,240],[239,239,239],[238,238,238],
    [237,237,237],[236,236,236],[235,235,235],[234,234,234],[233,233,233],
    [232,232,232],[255,255,255],[231,231,231],[230,230,230],[229,229,229],
    [228,228,228],[227,227,227],[223,223,223],[222,222,222],[255,255,255],
    [221,221,221],[220,220,220],[219,219,219],[218,218,218],[217,217,217],
    [216,216,216],[215,215,215],[214,214,214],[213,213,213],[212,212,212],
    [211,211,211],[255,255,255],[210,210,210],[209,209,209],[208,208,208],
    [207,207,207],[206,206,206],[205,205,205],[204,204,204],[203,203,203],
    [202,202,202],[201,201,201],[200,200,200],[255,255,255],[199,199,199],
    [198,198,198],[197,197,197],[196,196,196],[195,195,195],[255,255,255],
    [255,255,255],[255,255,255],[255,255,255],[255,255,255],[255,255,255],
    [255,255,255],[255,255,255],[255,255,255],[255,255,255],[255,255,255],
    [255,255,255],[255,255,255],[255,255,255],[255,255,255],[255,255,255],
    [255,255,255],[255,255,255],[255,255,255],[255,255,255],[255,255,255],
    [255,255,255],[255,255,255],[255,255,255],[255,255,255],[255,255,255],
    [255,255,255],[255,255,255],[255,255,255],[255,255,255],[255,255,255],
    [255,255,255],[191,191,191],[190,190,190],[255,255,255],[189,189,189],
    [188,188,188],[187,187,187],[186,186,186],[185,185,185],[184,184,184],
    [183,183,183],[182,182,182],[181,181,181],[180,180,180],[179,179,179],
    [255,255,255],[178,178,178],[177,177,177],[176,176,176],[175,175,175],
    [174,174,174],[173,173,173],[172,172,172],[171,171,171],[170,170,170],
    [169,169,169],[168,168,168],[255,255,255],[167,167,167],[166,166,166],
    [165,165,165],[164,164,164],[163,163,163],[159,159,159],[158,158,158],
    [255,255,255],[157,157,157],[156,156,156],[155,155,155],[154,154,154],
    [153,153,153],[152,152,152],[151,151,151],[150,150,150],[149,149,149],
    [148,148,148],[147,147,147],[255,255,255],[146,146,146],[145,145,145],
    [144,144,144],[143,143,143],[142,142,142],[141,141,141],[140,140,140],
    [139,139,139],[138,138,138],[137,137,137],[136,136,136],[255,255,255],
    [135,135,135],[134,134,134],[133,133,133],[132,132,132],[131,131,131],
    [127,127,127],[126,126,126],[255,255,255],[125,125,125],[124,124,124],
    [123,123,123],[122,122,122],[121,121,121],[120,120,120],[119,119,119],
    [118,118,118],[117,117,117],[116,116,116],[115,115,115],[255,255,255],
    [114,114,114],[113,113,113],[112,112,112],[111,111,111],[110,110,110],
    [109,109,109],[108,108,108],[107,107,107],[106,106,106],[105,105,105],
    [104,104,104],[255,255,255],[103,103,103],[102,102,102],[101,101,101],
    [100,100,100],[99,99,99],[95,95,95],[94,94,94],[255,255,255],
    [93,93,93],[92,92,92],[91,91,91],[90,90,90],[89,89,89],
    [88,88,88],[87,87,87],[86,86,86],[85,85,85],[84,84,84],
    [83,83,83],[255,255,255],[82,82,82],[81,81,81],[80,80,80],
    [79,79,79],[78,78,78],[77,77,77],[76,76,76],[75,75,75],
    [74,74,74],[73,73,73],[72,72,72],[255,255,255],[71,71,71],
    [70,70,70],[69,69,69],[68,68,68],[67,67,67],[63,63,63],
    [62,62,62],[255,255,255],[61,61,61],[60,60,60],[59,59,59],
    [58,58,58],[57,57,57],[56,56,56],[55,55,55],[54,54,54],
    [53,53,53],[52,52,52],[51,51,51],[255,255,255],[50,50,50],
    [49,49,49],[48,48,48],[47,47,47],[46,46,46],[45,45,45],
    [44,44,44],[43,43,43],[42,42,42],[41,41,41],[40,40,40],
    [255,255,255],[39,39,39],[38,38,38],[37,37,37],[36,36,36],
    [35,35,35]
];

// Parse a CLUT chunk into a palette array
function parseCLUTChunk(clutData) {
    const bytes = toUint8Array(clutData);
    const numColors = Math.min(256, Math.floor(bytes.length / 6));
    const palette = [];
    for (let i = 0; i < numColors; i++) {
        const offset = i * 6;
        // Director palettes store colors as 16-bit values per channel (we use high byte)
        palette.push([
            bytes[offset] || 0,      // R (high byte)
            bytes[offset + 2] || 0,  // G (high byte)
            bytes[offset + 4] || 0   // B (high byte)
        ]);
    }
    // Pad to 256 if needed
    while (palette.length < 256) {
        palette.push([0, 0, 0]);
    }
    return palette;
}

// Find the appropriate palette for a bitmap based on its palette ID
function findPaletteForBitmap(paletteId, paletteTypeOverride = 'auto') {
    // If user has selected a specific palette type, use it
    if (paletteTypeOverride === 'greyscale') {
        return GREYSCALE_PALETTE;
    }
    if (paletteTypeOverride === 'mac') {
        return MAC_PALETTE;
    }

    // Auto mode: detect based on palette ID
    // paletteId of -3 or -2 typically means greyscale in Director
    if (paletteId === -3 || paletteId === -2) {
        return GREYSCALE_PALETTE;
    }

    // paletteId > 0 references a cast member (try to look up CLUT)
    if (paletteId > 0 && currentDirFile) {
        try {
            // Try to find CLUT chunk for this palette member
            const keyTable = currentDirFile.keyTable;
            if (keyTable) {
                for (const entry of keyTable.entries) {
                    if (entry.castID === paletteId && entry.fourCC === FOURCC('C', 'L', 'U', 'T')) {
                        const clutData = currentDirFile.getChunkData(FOURCC('C', 'L', 'U', 'T'), entry.sectionID);
                        if (clutData) {
                            console.log('Found CLUT palette for ID:', paletteId);
                            return parseCLUTChunk(clutData);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Error looking up palette:', e);
        }
    }

    // Default fallback to Mac palette
    return MAC_PALETTE;
}

// Try to parse BITD data using PhotoRenderer format (with header at offset 28)
// Returns { width, height, bitDepth, totalWidth, paletteId, pixelDataOffset } or null if not in this format
function tryParsePhotoRendererFormat(bitdBytes) {
    if (bitdBytes.length < 70) return null; // Need at least header + some pixel data

    const view = new DataView(bitdBytes.buffer, bitdBytes.byteOffset, bitdBytes.byteLength);

    // PhotoRenderer format: header starts at offset 28
    const HEADER_OFFSET = 28;

    try {
        // Read bitmap properties at offset 28
        const totalWidth = view.getUint16(HEADER_OFFSET, false) & 0x7FFF;
        const top = view.getInt16(HEADER_OFFSET + 2, false);
        const left = view.getInt16(HEADER_OFFSET + 4, false);
        const bottom = view.getInt16(HEADER_OFFSET + 6, false);
        const right = view.getInt16(HEADER_OFFSET + 8, false);

        const width = right - left;
        const height = bottom - top;

        // Sanity check dimensions
        if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
            return null;
        }
        if (totalWidth <= 0 || totalWidth > 4096) {
            return null;
        }

        // After rect (10 bytes), skip 13 bytes, then read bitDepth (1 byte, at offset 28+10+13=51)
        // Actually per PhotoRenderer: skip 1, skip 7, readShort, readShort, read = 1+7+2+2+1 = 13 bytes
        const bitDepthOffset = HEADER_OFFSET + 10 + 13; // offset 51
        if (bitdBytes.length < bitDepthOffset + 1) return null;

        const bitDepth = bitdBytes[bitDepthOffset]; // Little-endian single byte

        // Validate bit depth
        if (bitDepth !== 1 && bitDepth !== 8 && bitDepth !== 16 && bitDepth !== 24 && bitDepth !== 32) {
            return null;
        }

        // Palette is at offset 52 (4 bytes big-endian int, subtract 1)
        const paletteOffset = bitDepthOffset + 1;
        if (bitdBytes.length < paletteOffset + 4) return null;
        const paletteId = view.getInt32(paletteOffset, false) - 1;

        // Skip 8 more bytes (4 + skip 4), then length at offset 64 (4 bytes little-endian)
        const lengthOffset = paletteOffset + 4 + 8; // offset 64
        if (bitdBytes.length < lengthOffset + 4) return null;

        // Read length as little-endian
        const length = view.getUint32(lengthOffset, true);

        // Pixel data starts at offset 68
        const pixelDataOffset = lengthOffset + 4; // offset 68

        console.log('PhotoRenderer format detected:', {
            totalWidth, width, height, bitDepth, paletteId, length, pixelDataOffset
        });

        return {
            width,
            height,
            bitDepth,
            totalWidth,
            paletteId,
            pixelDataOffset
        };
    } catch (e) {
        console.log('Not PhotoRenderer format:', e.message);
        return null;
    }
}

function displayBitmap(asset) {
    const member = asset.member;

    console.log('displayBitmap called for:', asset.name, 'id:', asset.id);
    console.log('  dataChunkId:', asset.dataChunkId);
    console.log('  member.specificData length:', member.specificData?.length);

    // Show the palette selector for bitmap assets
    const paletteSelector = document.getElementById('palette-selector');
    const paletteTypeSelect = document.getElementById('palette-type');
    if (paletteSelector) {
        paletteSelector.classList.remove('hidden');
    }

    // Try to get the BITD chunk data first
    let bitdData = null;
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('B', 'I', 'T', 'D'), asset.dataChunkId)) {
        try {
            bitdData = currentDirFile.getChunkData(FOURCC('B', 'I', 'T', 'D'), asset.dataChunkId);
            console.log('  BITD data size:', bitdData?.length || bitdData?.byteLength);
        } catch (e) {
            console.error('Error loading BITD chunk:', e);
        }
    }

    // Try PhotoRenderer format first (BITD contains header + pixel data)
    if (bitdData) {
        const bitdBytes = toUint8Array(bitdData);
        const photoFormat = tryParsePhotoRendererFormat(bitdBytes);

        if (photoFormat) {
            // Use PhotoRenderer format
            const { width, height, bitDepth, totalWidth, paletteId, pixelDataOffset } = photoFormat;

            // Get the selected palette type from UI
            const paletteTypeOverride = paletteTypeSelect ? paletteTypeSelect.value : 'auto';
            const palette = findPaletteForBitmap(paletteId, paletteTypeOverride);
            const paletteName = paletteTypeOverride !== 'auto' ? paletteTypeOverride :
                              (paletteId === -3 || paletteId === -2 ? 'greyscale (auto)' :
                               paletteId > 0 ? `custom #${paletteId}` : 'mac (default)');

            assetInfo.innerHTML += `
                <p><strong>Format:</strong> PhotoRenderer/Habbo</p>
                <p><strong>Dimensions:</strong> ${width} x ${height}</p>
                <p><strong>Bit Depth:</strong> ${bitDepth}-bit</p>
                <p><strong>Row Stride:</strong> ${totalWidth} bytes</p>
                <p><strong>Palette:</strong> ${paletteName} (ID: ${paletteId})</p>
            `;

            // Extract pixel data starting at pixelDataOffset
            const pixelData = bitdBytes.slice(pixelDataOffset);
            renderBitmapToCanvas(pixelData, width, height, bitDepth, totalWidth, palette, true); // Use PhotoRenderer RLE
            return;
        }
    }

    // Fall back to standard Director format (dimensions from specificData, BITD is just pixel data)
    if (!member.specificData || member.specificData.length < 14) {
        assetBinary.innerHTML = '<p>No bitmap data available</p>';
        assetBinary.classList.remove('hidden');
        return;
    }

    const data = member.specificData;
    const bytes = toUint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    try {
        // Parse bitmap member specific data
        // Format varies by version but generally:
        // Offset 0: totalWidth (row stride in bytes, includes padding)
        // Offset 2-9: initialRect (top, left, bottom, right)
        // Offset 10-17: boundingRect
        // Offset 18-21: regPoint (y, x)
        // Offset 22: flags or bitDepth

        let totalWidth = view.getUint16(0, false) & 0x7FFF;  // Row stride (mask high bit)
        const top = view.getInt16(2, false);
        const left = view.getInt16(4, false);
        const bottom = view.getInt16(6, false);
        const right = view.getInt16(8, false);
        const width = right - left;
        const height = bottom - top;

        let bitDepth = 8; // Default
        let paletteId = 0;

        // The high bit of totalWidth indicates if we have extended data
        const hasExtendedData = (view.getUint16(0, false) & 0x8000) !== 0;

        if (bytes.length >= 24) {
            // Try to get bit depth - location varies by version
            // For D4+, it's often at offset 22 as a byte
            const possibleBitDepth = view.getUint8(22);
            if (possibleBitDepth === 1 || possibleBitDepth === 2 || possibleBitDepth === 4 ||
                possibleBitDepth === 8 || possibleBitDepth === 16 || possibleBitDepth === 24 || possibleBitDepth === 32) {
                bitDepth = possibleBitDepth;
            }
        }

        // For D5+, bit depth might be at offset 22 as uint16
        if (currentDirFile.version >= 500 && bytes.length >= 24) {
            const altBitDepth = view.getUint16(22, false);
            if (altBitDepth === 1 || altBitDepth === 8 || altBitDepth === 16 || altBitDepth === 24 || altBitDepth === 32) {
                bitDepth = altBitDepth;
            }
        }

        // Try to parse palette ID from specificData
        if (bytes.length >= 26) {
            // Palette reference location varies by version
            paletteId = view.getInt16(24, false);
            console.log('  Parsed paletteId from specificData:', paletteId);
        }

        // Calculate expected row width if not provided
        if (totalWidth === 0) {
            totalWidth = Math.ceil((width * bitDepth) / 8);
            // Align to 2 bytes (word alignment)
            if (totalWidth % 2 !== 0) totalWidth++;
        }

        // Get the selected palette type from UI
        const paletteTypeOverride = paletteTypeSelect ? paletteTypeSelect.value : 'auto';

        // Get the appropriate palette
        const palette = findPaletteForBitmap(paletteId, paletteTypeOverride);
        const paletteName = paletteTypeOverride !== 'auto' ? paletteTypeOverride :
                          (paletteId === -3 || paletteId === -2 ? 'greyscale (auto)' :
                           paletteId > 0 ? `custom #${paletteId}` : 'mac (default)');

        // Update info with dimensions
        assetInfo.innerHTML += `
            <p><strong>Format:</strong> Standard Director</p>
            <p><strong>Dimensions:</strong> ${width} x ${height}</p>
            <p><strong>Bit Depth:</strong> ${bitDepth}-bit</p>
            <p><strong>Row Stride:</strong> ${totalWidth} bytes</p>
            <p><strong>Palette:</strong> ${paletteName}</p>
        `;

        if (bitdData) {
            renderBitmapToCanvas(bitdData, width, height, bitDepth, totalWidth, palette, false); // Use standard PackBits
        } else {
            console.log('  No BITD chunk found, showing binary data');
            assetInfo.innerHTML += `<p><strong>Note:</strong> Bitmap data chunk not found</p>`;
            displayBinaryData(asset);
        }
    } catch (e) {
        console.error('Error parsing bitmap:', e);
        displayBinaryData(asset);
    }
}

// Decompress RLE encoded data (used in Director BITD chunks)
// This matches PhotoRenderer's algorithm: marker >= 128 means repeat, < 128 means literal
function decompressRLE(compressed, expectedSize) {
    const output = new Uint8Array(expectedSize);
    let srcPos = 0;
    let dstPos = 0;

    while (srcPos < compressed.length && dstPos < expectedSize) {
        const marker = compressed[srcPos++];

        if (marker >= 128) {
            // Repeat next byte (257 - marker) times
            // For marker=128: repeat 129 times
            // For marker=255: repeat 2 times
            const count = 257 - marker;
            const value = srcPos < compressed.length ? compressed[srcPos++] : 0;
            for (let i = 0; i < count && dstPos < expectedSize; i++) {
                output[dstPos++] = value;
            }
        } else {
            // Copy (marker + 1) bytes literally
            // For marker=0: copy 1 byte
            // For marker=127: copy 128 bytes
            const count = marker + 1;
            for (let i = 0; i < count && dstPos < expectedSize && srcPos < compressed.length; i++) {
                output[dstPos++] = compressed[srcPos++];
            }
        }
    }

    return output;
}

// Standard PackBits decompression (128 is no-op) - for standard Director files
function decompressPackBits(compressed, expectedSize) {
    const output = new Uint8Array(expectedSize);
    let srcPos = 0;
    let dstPos = 0;

    while (srcPos < compressed.length && dstPos < expectedSize) {
        const n = compressed[srcPos++];

        if (n < 128) {
            // Copy n+1 bytes literally
            const count = n + 1;
            for (let i = 0; i < count && dstPos < expectedSize && srcPos < compressed.length; i++) {
                output[dstPos++] = compressed[srcPos++];
            }
        } else if (n > 128) {
            // Repeat next byte (257-n) times
            const count = 257 - n;
            const value = srcPos < compressed.length ? compressed[srcPos++] : 0;
            for (let i = 0; i < count && dstPos < expectedSize; i++) {
                output[dstPos++] = value;
            }
        }
        // n === 128 is a no-op in standard PackBits
    }

    return output;
}

function renderBitmapToCanvas(data, width, height, bitDepth, rowStride, palette = null, usePhotoRendererRLE = false) {
    console.log('renderBitmapToCanvas:', { width, height, bitDepth, rowStride, dataSize: data?.length || data?.byteLength, usePhotoRendererRLE });

    // Use provided palette or fall back to MAC_PALETTE
    palette = palette || MAC_PALETTE;

    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        console.log('  Invalid dimensions, showing error');
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

    const compressed = toUint8Array(data);

    // Calculate expected decompressed size
    const expectedSize = rowStride * height;

    // Try to decompress
    let bytes;
    if (compressed.length < expectedSize) {
        // Data is compressed - decompress it
        try {
            if (usePhotoRendererRLE) {
                // Use PhotoRenderer's RLE algorithm (marker >= 128 means repeat)
                bytes = decompressRLE(compressed, expectedSize);
                assetInfo.innerHTML += `<p><strong>Compression:</strong> RLE (${compressed.length} -> ${bytes.length} bytes)</p>`;
            } else {
                // Use standard PackBits (128 is no-op)
                bytes = decompressPackBits(compressed, expectedSize);
                assetInfo.innerHTML += `<p><strong>Compression:</strong> PackBits (${compressed.length} -> ${bytes.length} bytes)</p>`;
            }
        } catch (e) {
            console.error('Decompression error:', e);
            // Fall back to raw data
            bytes = compressed;
        }
    } else {
        bytes = compressed;
        if (compressed.length > expectedSize) {
            console.log('  Data larger than expected, using first', expectedSize, 'bytes');
        }
    }

    try {

        if (bitDepth === 1) {
            // 1-bit bitmap (black and white)
            for (let y = 0; y < height; y++) {
                const rowStart = y * rowStride;
                for (let x = 0; x < width; x++) {
                    const byteIndex = rowStart + Math.floor(x / 8);
                    const bitIndex = 7 - (x % 8);
                    const bit = (bytes[byteIndex] >> bitIndex) & 1;
                    const color = bit ? 0 : 255;  // 1 = black, 0 = white in Director
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = color;
                    pixels[dstOffset + 1] = color;
                    pixels[dstOffset + 2] = color;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 8) {
            // 8-bit indexed color
            for (let y = 0; y < height; y++) {
                const rowStart = y * rowStride;
                for (let x = 0; x < width; x++) {
                    const colorIndex = bytes[rowStart + x] || 0;
                    const [r, g, b] = palette[colorIndex] || [colorIndex, colorIndex, colorIndex];
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 16) {
            // 16-bit RGB (RGB555 big-endian)
            for (let y = 0; y < height; y++) {
                const rowStart = y * rowStride;
                for (let x = 0; x < width; x++) {
                    const offset = rowStart + x * 2;
                    const pixel = (bytes[offset] << 8) | bytes[offset + 1];
                    // RGB555: XRRRRRGGGGGBBBBB
                    const r = ((pixel >> 10) & 0x1F) * 255 / 31;
                    const g = ((pixel >> 5) & 0x1F) * 255 / 31;
                    const b = (pixel & 0x1F) * 255 / 31;
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 24) {
            // 24-bit RGB
            for (let y = 0; y < height; y++) {
                const rowStart = y * rowStride;
                for (let x = 0; x < width; x++) {
                    const offset = rowStart + x * 3;
                    const dstOffset = (y * width + x) * 4;
                    // Director uses BGR or RGB depending on platform
                    pixels[dstOffset] = bytes[offset] || 0;
                    pixels[dstOffset + 1] = bytes[offset + 1] || 0;
                    pixels[dstOffset + 2] = bytes[offset + 2] || 0;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else if (bitDepth === 32) {
            // 32-bit ARGB or RGBA
            for (let y = 0; y < height; y++) {
                const rowStart = y * rowStride;
                for (let x = 0; x < width; x++) {
                    const offset = rowStart + x * 4;
                    const dstOffset = (y * width + x) * 4;
                    // Director 32-bit is typically ARGB
                    pixels[dstOffset] = bytes[offset + 1] || 0;      // R
                    pixels[dstOffset + 1] = bytes[offset + 2] || 0;  // G
                    pixels[dstOffset + 2] = bytes[offset + 3] || 0;  // B
                    pixels[dstOffset + 3] = bytes[offset] || 255;    // A
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

// Mac Roman to Unicode mapping for extended characters
const MAC_ROMAN_MAP = {
    0x80: '\u00C4', 0x81: '\u00C5', 0x82: '\u00C7', 0x83: '\u00C9',
    0x84: '\u00D1', 0x85: '\u00D6', 0x86: '\u00DC', 0x87: '\u00E1',
    0x88: '\u00E0', 0x89: '\u00E2', 0x8A: '\u00E4', 0x8B: '\u00E3',
    0x8C: '\u00E5', 0x8D: '\u00E7', 0x8E: '\u00E9', 0x8F: '\u00E8',
    0x90: '\u00EA', 0x91: '\u00EB', 0x92: '\u00ED', 0x93: '\u00EC',
    0x94: '\u00EE', 0x95: '\u00EF', 0x96: '\u00F1', 0x97: '\u00F3',
    0x98: '\u00F2', 0x99: '\u00F4', 0x9A: '\u00F6', 0x9B: '\u00F5',
    0x9C: '\u00FA', 0x9D: '\u00F9', 0x9E: '\u00FB', 0x9F: '\u00FC',
    0xA0: '\u2020', 0xA1: '\u00B0', 0xA2: '\u00A2', 0xA3: '\u00A3',
    0xA4: '\u00A7', 0xA5: '\u2022', 0xA6: '\u00B6', 0xA7: '\u00DF',
    0xA8: '\u00AE', 0xA9: '\u00A9', 0xAA: '\u2122', 0xAB: '\u00B4',
    0xAC: '\u00A8', 0xAD: '\u2260', 0xAE: '\u00C6', 0xAF: '\u00D8',
    0xB0: '\u221E', 0xB1: '\u00B1', 0xB2: '\u2264', 0xB3: '\u2265',
    0xB4: '\u00A5', 0xB5: '\u00B5', 0xB6: '\u2202', 0xB7: '\u2211',
    0xB8: '\u220F', 0xB9: '\u03C0', 0xBA: '\u222B', 0xBB: '\u00AA',
    0xBC: '\u00BA', 0xBD: '\u03A9', 0xBE: '\u00E6', 0xBF: '\u00F8',
    0xC0: '\u00BF', 0xC1: '\u00A1', 0xC2: '\u00AC', 0xC3: '\u221A',
    0xC4: '\u0192', 0xC5: '\u2248', 0xC6: '\u2206', 0xC7: '\u00AB',
    0xC8: '\u00BB', 0xC9: '\u2026', 0xCA: '\u00A0', 0xCB: '\u00C0',
    0xCC: '\u00C3', 0xCD: '\u00D5', 0xCE: '\u0152', 0xCF: '\u0153',
    0xD0: '\u2013', 0xD1: '\u2014', 0xD2: '\u201C', 0xD3: '\u201D',
    0xD4: '\u2018', 0xD5: '\u2019', 0xD6: '\u00F7', 0xD7: '\u25CA',
    0xD8: '\u00FF', 0xD9: '\u0178', 0xDA: '\u2044', 0xDB: '\u20AC',
    0xDC: '\u2039', 0xDD: '\u203A', 0xDE: '\uFB01', 0xDF: '\uFB02',
    0xE0: '\u2021', 0xE1: '\u00B7', 0xE2: '\u201A', 0xE3: '\u201E',
    0xE4: '\u2030', 0xE5: '\u00C2', 0xE6: '\u00CA', 0xE7: '\u00C1',
    0xE8: '\u00CB', 0xE9: '\u00C8', 0xEA: '\u00CD', 0xEB: '\u00CE',
    0xEC: '\u00CF', 0xED: '\u00CC', 0xEE: '\u00D3', 0xEF: '\u00D4',
    0xF0: '\uF8FF', 0xF1: '\u00D2', 0xF2: '\u00DA', 0xF3: '\u00DB',
    0xF4: '\u00D9', 0xF5: '\u0131', 0xF6: '\u02C6', 0xF7: '\u02DC',
    0xF8: '\u00AF', 0xF9: '\u02D8', 0xFA: '\u02D9', 0xFB: '\u02DA',
    0xFC: '\u00B8', 0xFD: '\u02DD', 0xFE: '\u02DB', 0xFF: '\u02C7'
};

function macRomanToUtf8(bytes, start, length) {
    let result = '';
    for (let i = start; i < start + length && i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte === 0) break; // Null terminator
        if (byte < 128) {
            result += String.fromCharCode(byte);
        } else {
            result += MAC_ROMAN_MAP[byte] || String.fromCharCode(byte);
        }
    }
    return result;
}

function displayText(asset) {
    const member = asset.member;

    // Try to get text from STXT chunk
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('S', 'T', 'X', 'T'), asset.dataChunkId)) {
        try {
            const stxtData = currentDirFile.getChunkData(FOURCC('S', 'T', 'X', 'T'), asset.dataChunkId);
            const bytes = toUint8Array(stxtData);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

            // STXT chunk format:
            // Offset 0: headerLength (uint32, big-endian)
            // Offset 4: textLength (uint32, big-endian)
            // Offset 8: textOffset (relative to start of data after header)
            // After header: text data, then formatting data

            if (bytes.length >= 12) {
                const headerLength = view.getUint32(0, false);
                const textLength = view.getUint32(4, false);

                // Text starts after the header
                const textStart = headerLength;
                const textEnd = Math.min(textStart + textLength, bytes.length);

                // Decode text using Mac Roman encoding
                let text = macRomanToUtf8(bytes, textStart, textEnd - textStart);

                // Convert Mac line endings (CR) to Unix (LF)
                text = text.replace(/\r/g, '\n');

                assetInfo.innerHTML += `<p><strong>Text Length:</strong> ${textLength} characters</p>`;

                assetText.textContent = text || '(Empty text)';
                assetText.classList.remove('hidden');
                return;
            }
        } catch (e) {
            console.error('Error loading text:', e);
        }
    }

    // Fall back to displaying raw data
    displayBinaryData(asset);
}

function displayShape(asset) {
    const member = asset.member;

    if (!member.specificData || member.specificData.length < 4) {
        displayBinaryData(asset);
        return;
    }

    const bytes = toUint8Array(member.specificData);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    try {
        // Shape member specific data format:
        // Offset 0: shapeType (uint16)
        // Offset 2: boundingRect (8 bytes)
        // etc.

        const shapeType = view.getUint16(0, false);
        const shapeNames = {
            1: 'Rectangle',
            2: 'Round Rectangle',
            3: 'Oval',
            4: 'Line'
        };

        const shapeName = shapeNames[shapeType] || `Unknown (${shapeType})`;

        let infoHtml = `<p><strong>Shape Type:</strong> ${shapeName}</p>`;

        if (bytes.length >= 10) {
            const top = view.getInt16(2, false);
            const left = view.getInt16(4, false);
            const bottom = view.getInt16(6, false);
            const right = view.getInt16(8, false);
            infoHtml += `<p><strong>Bounds:</strong> ${right - left} x ${bottom - top}</p>`;
        }

        if (bytes.length >= 12) {
            const lineSize = view.getUint16(10, false);
            infoHtml += `<p><strong>Line Size:</strong> ${lineSize}</p>`;
        }

        assetInfo.innerHTML += infoHtml;

        // Draw the shape on canvas
        if (bytes.length >= 10) {
            const top = view.getInt16(2, false);
            const left = view.getInt16(4, false);
            const bottom = view.getInt16(6, false);
            const right = view.getInt16(8, false);
            const width = right - left;
            const height = bottom - top;

            if (width > 0 && height > 0 && width < 1000 && height < 1000) {
                const canvas = assetCanvas;
                const ctx = canvas.getContext('2d');
                canvas.width = width + 20;
                canvas.height = height + 20;

                ctx.fillStyle = '#16213e';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.strokeStyle = '#e94560';
                ctx.lineWidth = 2;
                ctx.fillStyle = '#0f3460';

                const x = 10, y = 10;

                switch (shapeType) {
                    case 1: // Rectangle
                        ctx.fillRect(x, y, width, height);
                        ctx.strokeRect(x, y, width, height);
                        break;
                    case 2: // Round Rectangle
                        const radius = Math.min(10, width / 4, height / 4);
                        ctx.beginPath();
                        ctx.roundRect(x, y, width, height, radius);
                        ctx.fill();
                        ctx.stroke();
                        break;
                    case 3: // Oval
                        ctx.beginPath();
                        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        break;
                    case 4: // Line
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + width, y + height);
                        ctx.stroke();
                        break;
                    default:
                        ctx.strokeRect(x, y, width, height);
                }

                canvas.classList.remove('hidden');
                return;
            }
        }
    } catch (e) {
        console.error('Error parsing shape:', e);
    }

    displayBinaryData(asset);
}

function displayButton(asset) {
    const member = asset.member;

    // Button members have text associated with them
    // Try to get the button text from STXT chunk
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('S', 'T', 'X', 'T'), asset.dataChunkId)) {
        displayText(asset);
        return;
    }

    if (!member.specificData || member.specificData.length < 2) {
        displayBinaryData(asset);
        return;
    }

    const bytes = toUint8Array(member.specificData);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    try {
        const buttonType = view.getUint16(0, false);
        const buttonTypes = {
            1: 'Push Button',
            2: 'Check Box',
            3: 'Radio Button'
        };

        assetInfo.innerHTML += `<p><strong>Button Type:</strong> ${buttonTypes[buttonType] || `Unknown (${buttonType})`}</p>`;
    } catch (e) {
        console.error('Error parsing button:', e);
    }

    displayBinaryData(asset);
}

function displayPalette(asset) {
    // Try to get palette data from CLUT chunk
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('C', 'L', 'U', 'T'), asset.dataChunkId)) {
        try {
            const clutData = currentDirFile.getChunkData(FOURCC('C', 'L', 'U', 'T'), asset.dataChunkId);
            const bytes = toUint8Array(clutData);

            // CLUT chunks contain 256 RGB entries (768 bytes) or similar
            const numColors = Math.min(256, Math.floor(bytes.length / 6));  // 6 bytes per color (RGB with high bytes)

            assetInfo.innerHTML += `<p><strong>Colors:</strong> ${numColors}</p>`;

            // Draw palette swatches
            const canvas = assetCanvas;
            const ctx = canvas.getContext('2d');
            const swatchSize = 16;
            const cols = 16;
            const rows = Math.ceil(numColors / cols);

            canvas.width = cols * swatchSize;
            canvas.height = rows * swatchSize;

            for (let i = 0; i < numColors; i++) {
                const offset = i * 6;
                // Director palettes store colors as 16-bit values per channel
                const r = bytes[offset] || 0;
                const g = bytes[offset + 2] || 0;
                const b = bytes[offset + 4] || 0;

                const x = (i % cols) * swatchSize;
                const y = Math.floor(i / cols) * swatchSize;

                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, swatchSize, swatchSize);
            }

            canvas.classList.remove('hidden');
            return;
        } catch (e) {
            console.error('Error loading palette:', e);
        }
    }

    displayBinaryData(asset);
}

function displaySound(asset) {
    const member = asset.member;

    // Try to get sound info
    if (asset.dataChunkId) {
        assetInfo.innerHTML += `<p><strong>Sound Data:</strong> Chunk #${asset.dataChunkId}</p>`;
    }

    if (member.specificData && member.specificData.length >= 4) {
        const bytes = toUint8Array(member.specificData);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        try {
            // Sound member specific data varies by format
            // Just show what data we have
            assetInfo.innerHTML += `<p><strong>Format Data:</strong> ${bytes.length} bytes</p>`;
        } catch (e) {
            console.error('Error parsing sound:', e);
        }
    }

    // Show a message that audio preview is not yet supported
    assetBinary.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <p style="color: #888; margin-bottom: 1rem;">Audio preview not yet supported.</p>
            <p style="color: #666;">Use the Download button to save the sound data.</p>
        </div>
    `;
    assetBinary.classList.remove('hidden');
}

function displayFilmLoop(asset) {
    const member = asset.member;

    assetInfo.innerHTML += `<p><strong>Type:</strong> Film Loop (animated sequence)</p>`;

    if (member.specificData && member.specificData.length >= 4) {
        const bytes = toUint8Array(member.specificData);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        try {
            // Film loop specific data
            if (bytes.length >= 2) {
                const frameCount = view.getUint16(0, false);
                assetInfo.innerHTML += `<p><strong>Frames:</strong> ${frameCount}</p>`;
            }
        } catch (e) {
            console.error('Error parsing film loop:', e);
        }
    }

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
