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

    // Asset filter controls
    const assetSearch = document.getElementById('asset-search');
    if (assetSearch) {
        let searchTimeout;
        assetSearch.addEventListener('input', () => {
            // Debounce search input
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(populateAssetList, 150);
        });
    }

    // Type filter checkboxes
    const typeFilters = document.querySelectorAll('#type-filters input[type="checkbox"]');
    typeFilters.forEach(cb => {
        cb.addEventListener('change', populateAssetList);
    });

    // Select All/None buttons
    const selectAllBtn = document.getElementById('select-all-types');
    const selectNoneBtn = document.getElementById('select-none-types');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            typeFilters.forEach(cb => cb.checked = true);
            populateAssetList();
        });
    }

    if (selectNoneBtn) {
        selectNoneBtn.addEventListener('click', () => {
            typeFilters.forEach(cb => cb.checked = false);
            populateAssetList();
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

// Get selected asset types from checkboxes
function getSelectedAssetTypes() {
    const checkboxes = document.querySelectorAll('#type-filters input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Get filtered assets based on search and type filters
function getFilteredAssets() {
    const searchInput = document.getElementById('asset-search');
    const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedTypes = getSelectedAssetTypes();

    return assets.filter(asset => {
        // Check type filter
        const matchesType = selectedTypes.length === 0 || selectedTypes.includes(asset.typeName);
        if (!matchesType) return false;

        // Check search filter
        if (!searchText) return true;
        const matchesName = asset.name.toLowerCase().includes(searchText);
        const matchesId = asset.id.toString().includes(searchText);
        return matchesName || matchesId;
    });
}

// Store filtered assets with their original indices for selection
let filteredAssetIndices = [];

function populateAssetList() {
    assetList.innerHTML = '';

    const filtered = getFilteredAssets();
    filteredAssetIndices = [];

    // Map filtered assets to their original indices
    filtered.forEach(asset => {
        const originalIndex = assets.indexOf(asset);
        filteredAssetIndices.push(originalIndex);
    });

    for (let i = 0; i < filtered.length; i++) {
        const asset = filtered[i];
        const originalIndex = filteredAssetIndices[i];
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="asset-name">${escapeHtml(asset.name)}</span>
            <span class="asset-type">${escapeHtml(asset.typeName)}</span>
            <span class="asset-id">#${asset.id}</span>
        `;
        li.addEventListener('click', () => selectAsset(originalIndex));
        assetList.appendChild(li);
    }

    // Update asset count display
    const assetCount = document.getElementById('asset-count');
    if (assetCount) {
        assetCount.textContent = `Showing ${filtered.length} of ${assets.length} assets`;
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

// Lingo syntax highlighter - Classic IDE colors
const LINGO_KEYWORDS = new Set([
    'on', 'end', 'if', 'then', 'else', 'repeat', 'while', 'with', 'in', 'to', 'down',
    'case', 'of', 'otherwise', 'tell', 'exit', 'next', 'return', 'do',
    'property', 'global', 'instance', 'method', 'factory',
    'set', 'put', 'into', 'after', 'before', 'new', 'delete', 'play', 'go', 'halt',
    'continue', 'pass', 'nothing', 'me', 'ancestor'
]);

const LINGO_OPERATORS = new Set([
    'and', 'or', 'not', 'mod', 'contains', 'starts'
]);

const LINGO_BUILTINS = new Set([
    'the', 'sprite', 'member', 'cast', 'castLib', 'field', 'window', 'menu',
    'void', 'true', 'false', 'VOID', 'TRUE', 'FALSE',
    'EMPTY', 'RETURN', 'ENTER', 'TAB', 'SPACE', 'QUOTE', 'BACKSPACE',
    'PI', 'point', 'rect', 'rgb', 'color', 'list', 'image'
]);

function escapeHtmlForHighlight(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function highlightLingo(code) {
    // Process line by line to handle comments properly
    const lines = code.split('\n');
    const highlightedLines = lines.map(line => {
        let result = '';
        let i = 0;

        while (i < line.length) {
            // Check for comment (-- to end of line)
            if (line[i] === '-' && line[i + 1] === '-') {
                const comment = escapeHtmlForHighlight(line.slice(i));
                result += `<span class="hl-comment">${comment}</span>`;
                break;
            }

            // Check for string
            if (line[i] === '"') {
                let end = i + 1;
                while (end < line.length && line[end] !== '"') {
                    if (line[end] === '\\') end++; // Skip escaped char
                    end++;
                }
                if (end < line.length) end++; // Include closing quote
                const str = escapeHtmlForHighlight(line.slice(i, end));
                result += `<span class="hl-string">${str}</span>`;
                i = end;
                continue;
            }

            // Check for symbol (#identifier)
            if (line[i] === '#') {
                let end = i + 1;
                while (end < line.length && /[\w]/.test(line[end])) end++;
                const symbol = escapeHtmlForHighlight(line.slice(i, end));
                result += `<span class="hl-symbol">${symbol}</span>`;
                i = end;
                continue;
            }

            // Check for number
            if (/\d/.test(line[i]) || (line[i] === '-' && /\d/.test(line[i + 1]))) {
                let end = i;
                if (line[end] === '-') end++;
                while (end < line.length && /[\d.]/.test(line[end])) end++;
                const num = escapeHtmlForHighlight(line.slice(i, end));
                result += `<span class="hl-number">${num}</span>`;
                i = end;
                continue;
            }

            // Check for identifier/keyword
            if (/[a-zA-Z_]/.test(line[i])) {
                let end = i;
                while (end < line.length && /[\w]/.test(line[end])) end++;
                const word = line.slice(i, end);
                const wordLower = word.toLowerCase();
                const escaped = escapeHtmlForHighlight(word);

                if (LINGO_KEYWORDS.has(wordLower)) {
                    result += `<span class="hl-keyword">${escaped}</span>`;
                } else if (LINGO_OPERATORS.has(wordLower)) {
                    result += `<span class="hl-operator">${escaped}</span>`;
                } else if (LINGO_BUILTINS.has(word) || LINGO_BUILTINS.has(wordLower)) {
                    result += `<span class="hl-builtin">${escaped}</span>`;
                } else {
                    result += escaped;
                }
                i = end;
                continue;
            }

            // Other characters (operators, punctuation, whitespace)
            result += escapeHtmlForHighlight(line[i]);
            i++;
        }

        return result;
    });

    return highlightedLines.join('\n');
}

function refreshCodeDisplay() {
    if (!selectedScript) {
        codeDisplay.innerHTML = '';
        return;
    }

    const dotSyntax = dotSyntaxCheckbox.checked;

    try {
        const code = selectedScript.script.scriptText('\n', dotSyntax);
        codeDisplay.innerHTML = highlightLingo(code);
    } catch (error) {
        console.error('Error generating script text:', error);
        codeDisplay.innerHTML = '<span class="hl-comment">-- Error generating script text: ' + escapeHtmlForHighlight(error.message) + '</span>';
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
    const audioPlayer = document.getElementById('audio-player');
    if (audioPlayer) audioPlayer.classList.add('hidden');

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

// Built-in palette IDs following ScummVM's Director engine
// These match the PaletteType enum values from ScummVM
const PaletteType = {
    kClutSystemMac: -1,
    kClutRainbow: -2,
    kClutGrayscale: -3,
    kClutPastels: -4,
    kClutVivid: -5,
    kClutNTSC: -6,
    kClutMetallic: -7,
    kClutWeb216: -8,
    kClutSystemWin: -101,
    kClutSystemWinD5: -102
};

// Generate Mac System palette (256 colors)
// This is the classic Macintosh system palette used by Director
function generateSystemMacPalette() {
    const palette = new Array(256);

    // The Mac system palette uses a 6x6x6 color cube for indices 0-215
    // with index 0 = white, arranged so lower indices are brighter
    for (let i = 0; i < 215; i++) {
        const r = 5 - Math.floor(i / 36);
        const g = 5 - Math.floor((i % 36) / 6);
        const b = 5 - (i % 6);
        palette[i] = [r * 51, g * 51, b * 51];
    }

    // Indices 215-254: Grayscale ramp (bright to dark)
    for (let i = 215; i < 255; i++) {
        const gray = Math.round(255 - ((i - 215) * 255 / 39));
        palette[i] = [gray, gray, gray];
    }

    // Index 255 = Black
    palette[255] = [0, 0, 0];
    // Override index 0 to ensure it's white
    palette[0] = [255, 255, 255];

    return palette;
}

// Generate Grayscale palette (256 levels from white to black)
function generateGrayscalePalette() {
    const palette = new Array(256);
    for (let i = 0; i < 256; i++) {
        // Linear interpolation: index 0 = white (255), index 255 = black (0)
        const gray = 255 - i;
        palette[i] = [gray, gray, gray];
    }
    return palette;
}

// Generate Rainbow palette
function generateRainbowPalette() {
    const palette = new Array(256);
    for (let i = 0; i < 256; i++) {
        // HSV to RGB conversion with H varying from 0 to 360
        const h = (i / 255) * 360;
        const s = 1.0;
        const v = 1.0;
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        palette[i] = [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }
    return palette;
}

// Cache of built-in palettes (generated on demand)
const builtInPalettes = {};

// Get a built-in palette by its ID
function getBuiltInPalette(paletteId) {
    // Check cache first
    if (builtInPalettes[paletteId]) {
        return builtInPalettes[paletteId];
    }

    let palette;
    switch (paletteId) {
        case PaletteType.kClutSystemMac:
        case PaletteType.kClutSystemWin:
        case PaletteType.kClutSystemWinD5:
            palette = generateSystemMacPalette();
            break;
        case PaletteType.kClutGrayscale:
            palette = generateGrayscalePalette();
            break;
        case PaletteType.kClutRainbow:
            palette = generateRainbowPalette();
            break;
        case PaletteType.kClutPastels:
        case PaletteType.kClutVivid:
        case PaletteType.kClutNTSC:
        case PaletteType.kClutMetallic:
        case PaletteType.kClutWeb216:
            // For unsupported palettes, fall back to Mac System
            palette = generateSystemMacPalette();
            break;
        default:
            // Unknown built-in palette, use Mac System as default
            palette = generateSystemMacPalette();
            break;
    }

    builtInPalettes[paletteId] = palette;
    return palette;
}

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

// Parse the palette ID from a bitmap member's specificData
// Following ScummVM's BitmapCastMember parsing logic
function parseBitmapPaletteId(specificData, version) {
    if (!specificData || specificData.length < 24) {
        return { paletteId: PaletteType.kClutSystemMac, castLib: -1 };
    }

    const bytes = toUint8Array(specificData);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Check if high bit of first word is set (indicates extended data)
    const bytesFlag = view.getUint16(0, false);
    const hasExtendedData = (bytesFlag & 0x8000) !== 0;

    if (!hasExtendedData) {
        // No palette info in specificData, use default
        return { paletteId: PaletteType.kClutSystemMac, castLib: -1 };
    }

    // For Director version >= 400, palette info is at different offsets
    // specificData layout for D4+:
    // 0-1: totalWidth (with high bit flag)
    // 2-9: initialRect (top, left, bottom, right)
    // 10-17: boundingRect
    // 18-21: regPoint (y, x)
    // 22: skip 1 byte (or flags)
    // 23: bitsPerPixel
    // 24-25: clutCastLib (for D5+)
    // 26-27: clutId (or 24-25 for D4)

    let paletteId = PaletteType.kClutSystemMac;
    let castLib = -1;

    try {
        if (version >= 500) {
            // D5+: has castLib field
            if (bytes.length >= 28) {
                castLib = view.getInt16(24, false);
                paletteId = view.getInt16(26, false);
            }
        } else if (version >= 400) {
            // D4: no castLib field
            if (bytes.length >= 26) {
                paletteId = view.getInt16(24, false);
            }
        } else {
            // Pre-D4: simpler format
            // Palette ID after regPoint at offset 22
            if (bytes.length >= 24) {
                paletteId = view.getInt16(22, false);
            }
        }

        // ScummVM convention: built-in palettes are stored as (id - 1) in file
        // So clutId <= 0 means built-in, need to subtract 1 to get actual ID
        if (paletteId <= 0) {
            paletteId = paletteId - 1;
            castLib = -1;
        }
    } catch (e) {
        console.warn('Error parsing palette ID:', e);
    }

	paletteId = 0;
    console.log('Parsed palette ID:', paletteId, 'castLib:', castLib);
    return { paletteId, castLib };
}

// Get the palette for a bitmap by looking up its palette reference
// Following ScummVM's approach: negative IDs are built-in, positive are cast members
function getPaletteForBitmap(bitmapMember) {
    const version = currentDirFile?.version || 500;
    const { paletteId, castLib } = parseBitmapPaletteId(bitmapMember.specificData, version);

    // Built-in palette (negative ID)
    if (paletteId < 0) {
        console.log('Using built-in palette:', paletteId);
        return {
            palette: getBuiltInPalette(paletteId),
            name: getPaletteName(paletteId),
            id: paletteId
        };
    }

    // Cast member palette (positive ID) - look up CLUT chunk
    if (paletteId > 0 && currentDirFile) {
        try {
            const keyTable = currentDirFile.keyTable;
            if (keyTable) {
                const clutFourCC = FOURCC('C', 'L', 'U', 'T');
                for (const entry of keyTable.entries) {
                    if (entry.castID === paletteId && entry.fourCC === clutFourCC) {
                        const clutData = currentDirFile.getChunkData(clutFourCC, entry.sectionID);
                        if (clutData) {
                            console.log('Found CLUT palette for cast member ID:', paletteId);
                            return {
                                palette: parseCLUTChunk(clutData),
                                name: `Cast Member #${paletteId}`,
                                id: paletteId
                            };
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Error looking up CLUT palette:', e);
        }
    }

    // Default fallback to Mac System palette
    console.log('Using default Mac System palette');
    return {
        palette: getBuiltInPalette(PaletteType.kClutSystemMac),
        name: 'System - Mac',
        id: PaletteType.kClutSystemMac
    };
}

// Get human-readable name for a palette ID
function getPaletteName(paletteId) {
    switch (paletteId) {
        case PaletteType.kClutSystemMac: return 'System - Mac';
        case PaletteType.kClutRainbow: return 'Rainbow';
        case PaletteType.kClutGrayscale: return 'Grayscale';
        case PaletteType.kClutPastels: return 'Pastels';
        case PaletteType.kClutVivid: return 'Vivid';
        case PaletteType.kClutNTSC: return 'NTSC';
        case PaletteType.kClutMetallic: return 'Metallic';
        case PaletteType.kClutWeb216: return 'Web 216';
        case PaletteType.kClutSystemWin: return 'System - Win';
        case PaletteType.kClutSystemWinD5: return 'System - Win (D5)';
        default:
            if (paletteId > 0) return `Cast Member #${paletteId}`;
            return `Unknown (${paletteId})`;
    }
}

/**
 * BITD Decoder - Following ScummVM's Director engine implementation
 * Handles decompression and pixel extraction for Director bitmap data
 */

// Parse bitmap member specific data following ScummVM's BitmapCastMember
function parseBitmapMemberData(specificData, version) {
    if (!specificData || specificData.length < 10) {
        return null;
    }

    const bytes = toUint8Array(specificData);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Common header for all versions:
    // Offset 0-1: flags/pitch (high bit indicates extended data)
    // Offset 2-9: initialRect (top, left, bottom, right)
    const flags = view.getUint16(0, false);
    const top = view.getInt16(2, false);
    const left = view.getInt16(4, false);
    const bottom = view.getInt16(6, false);
    const right = view.getInt16(8, false);

    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
        return null;
    }

    let pitch = 0;
    let bitsPerPixel = 1;
    let paletteId = PaletteType.kClutSystemMac;

    if (version < 400) {
        // Pre-D4: Calculate pitch from width, pad to 16-byte boundary
        // ScummVM: pitch = width; if (pitch % 16) pitch += 16 - (width % 16); pitch *= bpp; pitch >>= 3;
        pitch = width;
        if (pitch % 16 !== 0) {
            pitch += 16 - (width % 16);
        }

        // For pre-D4, check if we have extended data
        if ((flags & 0x8000) !== 0 && bytes.length >= 24) {
            bitsPerPixel = view.getUint16(20, false);
            const clutId = view.getInt16(22, false);
            paletteId = clutId <= 0 ? clutId - 1 : clutId;
        }

        pitch = (pitch * bitsPerPixel) >> 3;
    } else {
        // D4+: pitch is stored in the data (masked)
        pitch = flags & 0x7FFF;

        // Read bounding rect (offset 10-17), regPoint (18-21)
        // Then flags1 at 22, bitsPerPixel at 23
        if (bytes.length >= 24) {
            bitsPerPixel = view.getUint8(23);
            if (bitsPerPixel === 0) bitsPerPixel = 1;
        }

        // Palette ID location depends on version
        if (version >= 500 && bytes.length >= 28) {
            // D5+: clutCastLib at 24-25, clutId at 26-27
            paletteId = view.getInt16(26, false);
            if (paletteId <= 0) paletteId = paletteId - 1;
        } else if (bytes.length >= 26) {
            // D4: clutId at 24-25
            paletteId = view.getInt16(24, false);
            if (paletteId <= 0) paletteId = paletteId - 1;
        }
    }

    // If pitch is still 0, calculate it
    if (pitch === 0) {
        pitch = Math.ceil((width * bitsPerPixel) / 8);
        // Align to word boundary
        if (pitch % 2 !== 0) pitch++;
    }

    console.log('parseBitmapMemberData:', { width, height, bitsPerPixel, pitch, paletteId, version });

    return {
        width,
        height,
        bitsPerPixel,
        pitch,
        paletteId,
        top,
        left
    };
}

// ScummVM-style RLE decompression for BITD chunks
// Returns decompressed data, or null if data appears uncompressed
function decompressBITD(stream, expectedBytes, version, bitsPerPixel) {
    const streamSize = stream.length;

    // Check if data is uncompressed
    // ScummVM: For 32-bit before D4, data is always raw
    if (version < 400 && bitsPerPixel === 32) {
        return stream;
    }

    // If stream is at least as large as expected, assume uncompressed
    if (streamSize >= expectedBytes) {
        return stream;
    }

    // RLE decompression following ScummVM
    const output = new Uint8Array(expectedBytes);
    let srcPos = 0;
    let dstPos = 0;

    while (srcPos < streamSize && dstPos < expectedBytes) {
        const code = stream[srcPos++];

        if ((code & 0x80) === 0) {
            // Literal run: copy (code + 1) bytes
            const count = code + 1;
            for (let i = 0; i < count && srcPos < streamSize && dstPos < expectedBytes; i++) {
                output[dstPos++] = stream[srcPos++];
            }
        } else {
            // Repeat run: repeat next byte ((code ^ 0xFF) + 2) times
            const count = (code ^ 0xFF) + 2;
            const value = srcPos < streamSize ? stream[srcPos++] : 0;
            for (let i = 0; i < count && dstPos < expectedBytes; i++) {
                output[dstPos++] = value;
            }
        }
    }

    // Pad with zeros if we didn't get enough data
    while (dstPos < expectedBytes) {
        output[dstPos++] = 0;
    }

    return output;
}

function displayBitmap(asset) {
    const member = asset.member;
    const version = currentDirFile?.version || 500;

    console.log('displayBitmap called for:', asset.name, 'id:', asset.id, 'version:', version);

    // Try to get the BITD chunk data
    let bitdData = null;
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('B', 'I', 'T', 'D'), asset.dataChunkId)) {
        try {
            bitdData = currentDirFile.getChunkData(FOURCC('B', 'I', 'T', 'D'), asset.dataChunkId);
            console.log('  BITD data size:', bitdData?.length || bitdData?.byteLength);
        } catch (e) {
            console.error('Error loading BITD chunk:', e);
        }
    }

    // Parse bitmap member data
    const bitmapInfo = parseBitmapMemberData(member.specificData, version);
    if (!bitmapInfo) {
        assetBinary.innerHTML = '<p>No bitmap data available or invalid format</p>';
        assetBinary.classList.remove('hidden');
        return;
    }

    const { width, height, bitsPerPixel, pitch, paletteId } = bitmapInfo;

    // Get the appropriate palette
    let paletteInfo;
    if (paletteId < 0) {
        paletteInfo = {
            palette: getBuiltInPalette(paletteId),
            name: getPaletteName(paletteId),
            id: paletteId
        };
    } else if (paletteId > 0) {
        // Try to load custom palette from CLUT
        paletteInfo = getPaletteForBitmap(member);
    } else {
        paletteInfo = {
            palette: getBuiltInPalette(PaletteType.kClutSystemMac),
            name: 'System - Mac',
            id: PaletteType.kClutSystemMac
        };
    }

    // Update info display
    assetInfo.innerHTML += `
        <p><strong>Dimensions:</strong> ${width} x ${height}</p>
        <p><strong>Bit Depth:</strong> ${bitsPerPixel}-bit</p>
        <p><strong>Pitch:</strong> ${pitch} bytes/row</p>
        <p><strong>Palette:</strong> ${paletteInfo.name} (ID: ${paletteInfo.id})</p>
    `;

    if (!bitdData) {
        console.log('  No BITD chunk found');
        assetInfo.innerHTML += `<p><strong>Note:</strong> Bitmap data chunk not found</p>`;
        displayBinaryData(asset);
        return;
    }

    try {
        const bitdBytes = toUint8Array(bitdData);
        decodeBITD(bitdBytes, width, height, bitsPerPixel, pitch, paletteInfo.palette, version);
    } catch (e) {
        console.error('Error decoding bitmap:', e);
        assetInfo.innerHTML += `<p><strong>Error:</strong> ${e.message}</p>`;
        displayBinaryData(asset);
    }
}

// Main BITD decoder following ScummVM's BITDDecoder::loadStream
function decodeBITD(stream, width, height, bitsPerPixel, pitch, palette, version) {
    console.log('decodeBITD:', { width, height, bitsPerPixel, pitch, streamSize: stream.length, version });

    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        throw new Error('Invalid bitmap dimensions');
    }

    const canvas = assetCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Use default palette if not provided
    palette = palette || getBuiltInPalette(PaletteType.kClutSystemMac);

    // Calculate bytes per pixel for pitch calculation
    let bytesPerPixel;
    if (bitsPerPixel <= 8) {
        bytesPerPixel = 1;
    } else if (bitsPerPixel === 16) {
        bytesPerPixel = 2;
    } else {
        bytesPerPixel = 4;
    }

    // Expected uncompressed size
    const expectedBytes = pitch * height;

    // Decompress if needed
    const isCompressed = stream.length < expectedBytes;
    let data;

    if (isCompressed) {
        data = decompressBITD(stream, expectedBytes, version, bitsPerPixel);
        assetInfo.innerHTML += `<p><strong>Compression:</strong> RLE (${stream.length} -> ${data.length} bytes)</p>`;
    } else {
        data = stream;
        assetInfo.innerHTML += `<p><strong>Compression:</strong> None</p>`;
    }

    // Pixel extraction based on bit depth
    // Following ScummVM's BITDDecoder::loadStream

    if (bitsPerPixel === 1) {
        // 1-bit: 8 pixels per byte
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const byteIdx = y * pitch + Math.floor(x / 8);
                const bitIdx = 7 - (x % 8);
                const bit = (data[byteIdx] >> bitIdx) & 1;
                // ScummVM: bit ? 0x00 : 0xff (1 = black, 0 = white)
                const color = bit ? 0 : 255;
                const dstOffset = (y * width + x) * 4;
                pixels[dstOffset] = color;
                pixels[dstOffset + 1] = color;
                pixels[dstOffset + 2] = color;
                pixels[dstOffset + 3] = 255;
            }
        }
    } else if (bitsPerPixel === 2) {
        // 2-bit: 4 pixels per byte
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const byteIdx = y * pitch + Math.floor(x / 4);
                const shift = 2 * (3 - (x % 4));
                const colorIdx = (data[byteIdx] >> shift) & 0x03;
                // 2-bit grayscale: 0=white, 3=black
                const gray = 255 - (colorIdx * 85);
                const dstOffset = (y * width + x) * 4;
                pixels[dstOffset] = gray;
                pixels[dstOffset + 1] = gray;
                pixels[dstOffset + 2] = gray;
                pixels[dstOffset + 3] = 255;
            }
        }
    } else if (bitsPerPixel === 4) {
        // 4-bit: 2 pixels per byte
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const byteIdx = y * pitch + Math.floor(x / 2);
                const shift = 4 * (1 - (x % 2));
                const colorIdx = (data[byteIdx] >> shift) & 0x0F;
                const [r, g, b] = palette[colorIdx] || [colorIdx * 17, colorIdx * 17, colorIdx * 17];
                const dstOffset = (y * width + x) * 4;
                pixels[dstOffset] = r;
                pixels[dstOffset + 1] = g;
                pixels[dstOffset + 2] = b;
                pixels[dstOffset + 3] = 255;
            }
        }
    } else if (bitsPerPixel === 8) {
        // 8-bit: 1 pixel per byte, indexed color
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const byteIdx = y * pitch + x;
                const colorIdx = data[byteIdx] || 0;
                const [r, g, b] = palette[colorIdx] || [colorIdx, colorIdx, colorIdx];
                const dstOffset = (y * width + x) * 4;
                pixels[dstOffset] = r;
                pixels[dstOffset + 1] = g;
                pixels[dstOffset + 2] = b;
                pixels[dstOffset + 3] = 255;
            }
        }
    } else if (bitsPerPixel === 16) {
        // 16-bit RGB555
        // ScummVM: For compressed data, bytes are interleaved across width
        if (isCompressed) {
            // Compressed 16-bit: high bytes first, then low bytes
            for (let y = 0; y < height; y++) {
                const rowStart = y * pitch;
                for (let x = 0; x < width; x++) {
                    const hi = data[rowStart + x];
                    const lo = data[rowStart + width + x];
                    const pixel = (hi << 8) | lo;
                    // RGB555: xRRRRRGGGGGBBBBB
                    const r = Math.round(((pixel >> 10) & 0x1F) * 255 / 31);
                    const g = Math.round(((pixel >> 5) & 0x1F) * 255 / 31);
                    const b = Math.round((pixel & 0x1F) * 255 / 31);
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = 255;
                }
            }
        } else {
            // Uncompressed 16-bit: sequential bytes
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset = y * pitch + x * 2;
                    const pixel = (data[offset] << 8) | data[offset + 1];
                    const r = Math.round(((pixel >> 10) & 0x1F) * 255 / 31);
                    const g = Math.round(((pixel >> 5) & 0x1F) * 255 / 31);
                    const b = Math.round((pixel & 0x1F) * 255 / 31);
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = 255;
                }
            }
        }
    } else if (bitsPerPixel === 32) {
        // 32-bit ARGB
        // ScummVM: For compressed D4+ data, channels are separated across rows
        if (isCompressed && version >= 400) {
            // Compressed 32-bit in D4+: A, R, G, B are in separate row sections
            for (let y = 0; y < height; y++) {
                const rowStart = y * pitch;
                for (let x = 0; x < width; x++) {
                    // Channels are interleaved: A row, R row, G row, B row
                    const a = data[rowStart + x];
                    const r = data[rowStart + width + x];
                    const g = data[rowStart + width * 2 + x];
                    const b = data[rowStart + width * 3 + x];
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = a;
                }
            }
        } else {
            // Uncompressed or pre-D4: sequential ARGB bytes
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset = y * pitch + x * 4;
                    const a = data[offset] || 255;
                    const r = data[offset + 1] || 0;
                    const g = data[offset + 2] || 0;
                    const b = data[offset + 3] || 0;
                    const dstOffset = (y * width + x) * 4;
                    pixels[dstOffset] = r;
                    pixels[dstOffset + 1] = g;
                    pixels[dstOffset + 2] = b;
                    pixels[dstOffset + 3] = a;
                }
            }
        }
    } else {
        throw new Error(`Unsupported bit depth: ${bitsPerPixel}`);
    }

    ctx.putImageData(imageData, 0, 0);
    canvas.classList.remove('hidden');
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

// Detect sound format from header bytes
function detectSoundFormat(bytes) {
    if (bytes.length < 12) return { format: 'unknown', mimeType: 'application/octet-stream', ext: '.bin' };

    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

    // Check for AIFF: 'FORM' + size + 'AIFF' or 'AIFC'
    if (magic === 'FORM') {
        const type = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (type === 'AIFF' || type === 'AIFC') {
            return { format: 'aiff', mimeType: 'audio/aiff', ext: '.aiff' };
        }
    }

    // Check for WAV: 'RIFF' + size + 'WAVE'
    if (magic === 'RIFF') {
        const type = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (type === 'WAVE') {
            return { format: 'wav', mimeType: 'audio/wav', ext: '.wav' };
        }
    }

    // Check for Mac SND resource format (type 1 or 2)
    const sndType = (bytes[0] << 8) | bytes[1];
    if (sndType === 1 || sndType === 2) {
        return { format: 'snd', mimeType: 'audio/basic', ext: '.snd' };
    }

    // Check for MP3 (ID3 header or sync word)
    if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // 'ID3'
        (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) { // MP3 sync
        return { format: 'mp3', mimeType: 'audio/mpeg', ext: '.mp3' };
    }

    return { format: 'unknown', mimeType: 'application/octet-stream', ext: '.snd' };
}

// Convert Mac SND resource to WAV format for browser playback
function convertSndToWav(sndBytes) {
    try {
        const view = new DataView(sndBytes.buffer, sndBytes.byteOffset, sndBytes.byteLength);
        const sndType = view.getUint16(0, false); // Big-endian

        let sampleRate = 22050; // Default
        let numChannels = 1;
        let bitsPerSample = 8;
        let dataOffset = 0;
        let dataLength = 0;

        if (sndType === 1) {
            // Type 1 SND: has data type list
            const numDataFormats = view.getUint16(2, false);
            let offset = 4;

            for (let i = 0; i < numDataFormats; i++) {
                const dataType = view.getUint16(offset, false);
                offset += 2;
                if (dataType === 5) { // sampled sound
                    // Skip options
                    offset += 4;
                }
            }

            // Read sound commands
            const numCommands = view.getUint16(offset, false);
            offset += 2;

            for (let i = 0; i < numCommands; i++) {
                const cmd = view.getUint16(offset, false);
                offset += 2;
                const param1 = view.getUint16(offset, false);
                offset += 2;
                const param2 = view.getUint32(offset, false);
                offset += 4;

                if (cmd === 0x8051) { // bufferCmd with data offset
                    dataOffset = param2;
                }
            }
        } else if (sndType === 2) {
            // Type 2 SND: simpler format
            dataOffset = 4; // Data starts after header
        }

        if (dataOffset === 0 || dataOffset >= sndBytes.length) {
            // Try to find sound header by scanning
            dataOffset = 20; // Common offset
        }

        // Parse sound header at dataOffset
        if (dataOffset + 22 <= sndBytes.length) {
            const samplePtr = view.getUint32(dataOffset, false);
            const numSamples = view.getUint32(dataOffset + 4, false);
            const sampleRateFixed = view.getUint32(dataOffset + 8, false);
            const loopStart = view.getUint32(dataOffset + 12, false);
            const loopEnd = view.getUint32(dataOffset + 16, false);
            const encoding = view.getUint8(dataOffset + 20);
            const baseFreq = view.getUint8(dataOffset + 21);

            // Sample rate is fixed-point 16.16
            sampleRate = Math.round(sampleRateFixed / 65536);
            if (sampleRate < 1000 || sampleRate > 96000) sampleRate = 22050;

            dataOffset += 22; // Move past header to sample data
            dataLength = numSamples > 0 ? numSamples : sndBytes.length - dataOffset;
        } else {
            dataLength = sndBytes.length - dataOffset;
        }

        // Extract PCM data
        const pcmData = sndBytes.slice(dataOffset, dataOffset + dataLength);

        // Build WAV file
        const wavSize = 44 + pcmData.length;
        const wavBuffer = new ArrayBuffer(wavSize);
        const wavView = new DataView(wavBuffer);
        const wavBytes = new Uint8Array(wavBuffer);

        // RIFF header
        wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
        wavView.setUint32(4, wavSize - 8, true); // File size - 8
        wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // 'WAVE'

        // fmt chunk
        wavBytes.set([0x66, 0x6D, 0x74, 0x20], 12); // 'fmt '
        wavView.setUint32(16, 16, true); // Chunk size
        wavView.setUint16(20, 1, true); // Audio format (PCM)
        wavView.setUint16(22, numChannels, true);
        wavView.setUint32(24, sampleRate, true);
        wavView.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // Byte rate
        wavView.setUint16(32, numChannels * bitsPerSample / 8, true); // Block align
        wavView.setUint16(34, bitsPerSample, true);

        // data chunk
        wavBytes.set([0x64, 0x61, 0x74, 0x61], 36); // 'data'
        wavView.setUint32(40, pcmData.length, true);
        wavBytes.set(pcmData, 44);

        return { data: wavBytes, sampleRate, numChannels, bitsPerSample, numSamples: pcmData.length };
    } catch (e) {
        console.error('Error converting SND to WAV:', e);
        return null;
    }
}

function displaySound(asset) {
    const member = asset.member;

    // Try to load sound data
    let soundData = null;
    if (asset.dataChunkId && currentDirFile.chunkExists(FOURCC('s', 'n', 'd', ' '), asset.dataChunkId)) {
        try {
            soundData = currentDirFile.getChunkData(FOURCC('s', 'n', 'd', ' '), asset.dataChunkId);
        } catch (e) {
            console.error('Error loading sound chunk:', e);
        }
    }

    if (!soundData) {
        assetInfo.innerHTML += `<p><strong>Status:</strong> No sound data found</p>`;
        assetBinary.innerHTML = '<p>Sound data not available</p>';
        assetBinary.classList.remove('hidden');
        return;
    }

    const soundBytes = toUint8Array(soundData);
    const formatInfo = detectSoundFormat(soundBytes);

    assetInfo.innerHTML += `
        <p><strong>Format:</strong> ${formatInfo.format.toUpperCase()}</p>
        <p><strong>Size:</strong> ${soundBytes.length.toLocaleString()} bytes</p>
    `;

    // Store format info for download
    asset.soundFormat = formatInfo;

    // Try to play the audio
    const audioPlayer = document.getElementById('audio-player');
    const soundPreview = document.getElementById('sound-preview');

    if (audioPlayer && soundPreview) {
        let audioBlob = null;
        let mimeType = formatInfo.mimeType;

        if (formatInfo.format === 'aiff' || formatInfo.format === 'wav' || formatInfo.format === 'mp3') {
            // These formats may be playable directly by the browser
            audioBlob = new Blob([soundBytes], { type: mimeType });
        } else if (formatInfo.format === 'snd') {
            // Try to convert Mac SND to WAV
            const wavResult = convertSndToWav(soundBytes);
            if (wavResult) {
                audioBlob = new Blob([wavResult.data], { type: 'audio/wav' });
                mimeType = 'audio/wav';
                assetInfo.innerHTML += `
                    <p><strong>Sample Rate:</strong> ${wavResult.sampleRate} Hz</p>
                    <p><strong>Channels:</strong> ${wavResult.numChannels}</p>
                    <p><strong>Bits:</strong> ${wavResult.bitsPerSample}-bit</p>
                `;
            }
        }

        if (audioBlob) {
            // Revoke previous URL if any
            if (soundPreview.src && soundPreview.src.startsWith('blob:')) {
                URL.revokeObjectURL(soundPreview.src);
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            soundPreview.src = audioUrl;
            audioPlayer.classList.remove('hidden');

            // Handle playback errors
            soundPreview.onerror = () => {
                console.warn('Audio playback not supported for this format');
                audioPlayer.classList.add('hidden');
                assetBinary.innerHTML = `
                    <div style="text-align: center; padding: 1rem;">
                        <p style="color: #888;">Audio preview not available for this format.</p>
                        <p style="color: #666;">Use the Download button to save the sound file.</p>
                    </div>
                `;
                assetBinary.classList.remove('hidden');
            };
        } else {
            // Can't convert or play
            assetBinary.innerHTML = `
                <div style="text-align: center; padding: 1rem;">
                    <p style="color: #888;">Audio preview not available for this format.</p>
                    <p style="color: #666;">Use the Download button to save the sound file.</p>
                </div>
            `;
            assetBinary.classList.remove('hidden');
        }
    }
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
                        // Use detected format if available
                        if (selectedAsset.soundFormat) {
                            filename += selectedAsset.soundFormat.ext;
                            mimeType = selectedAsset.soundFormat.mimeType;
                        } else {
                            // Detect format from data
                            const formatInfo = detectSoundFormat(data);
                            filename += formatInfo.ext;
                            mimeType = formatInfo.mimeType;
                        }
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
