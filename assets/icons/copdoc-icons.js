/**
 * COPDoc Icons — Lucide (ISC) paths used by shell, home, and modules.
 * https://lucide.dev/license
 *
 * Usage:
 *   <script src="assets/icons/copdoc-icons.js"></script>
 *   COPDoc.icons.inject();
 *   el.innerHTML = COPDoc.icons.html("Crosshair", 16);
 *   // also: OpDocIcons.html("MapPin", 18)
 */
(function (g) {
  "use strict";
  var own = Object.prototype.hasOwnProperty;

  function hasOwn(object, key) {
    return own.call(object, key);
  }

  var ICONS = {
    Archive: {
      id: "icon-archive",
      name: "archive",
      svg: '<rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />',
    },
    ArrowRight: {
      id: "icon-arrow-right",
      name: "arrow-right",
      svg: '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />',
    },
    Building2: {
      id: "icon-building-2",
      name: "building-2",
      svg: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" /><path d="M6 12H4a2 2 0 0 0-2 2v8" /><path d="M18 9h2a2 2 0 0 1 2 2v11" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /><path d="M8 22h8" />',
    },
    Car: {
      id: "icon-car",
      name: "car",
      svg: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />',
    },
    Check: {
      id: "icon-check",
      name: "check",
      svg: '<path d="M20 6 9 17l-5-5" />',
    },
    CircleCheck: {
      id: "icon-circle-check",
      name: "circle-check",
      svg: '<circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />',
    },
    CircleParking: {
      id: "icon-circle-parking",
      name: "circle-parking",
      svg: '<circle cx="12" cy="12" r="10" /><path d="M9 17V7h4a3 3 0 0 1 0 6H9" />',
    },
    CirclePlus: {
      id: "icon-circle-plus",
      name: "circle-plus",
      svg: '<circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" />',
    },
    ChevronDown: {
      id: "icon-chevron-down",
      name: "chevron-down",
      svg: '<path d="m6 9 6 6 6-6" />',
    },
    ChevronRight: {
      id: "icon-chevron-right",
      name: "chevron-right",
      svg: '<path d="m9 18 6-6-6-6" />',
    },
    ChevronUp: {
      id: "icon-chevron-up",
      name: "chevron-up",
      svg: '<path d="m18 15-6-6-6 6" />',
    },
    ClipboardList: {
      id: "icon-clipboard-list",
      name: "clipboard-list",
      svg: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />',
    },
    Copy: {
      id: "icon-copy",
      name: "copy",
      svg: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
    },
    Crop: {
      id: "icon-crop",
      name: "crop",
      svg: '<path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" />',
    },
    Crosshair: {
      id: "icon-crosshair",
      name: "crosshair",
      svg: '<circle cx="12" cy="12" r="10" /><line x1="22" x2="18" y1="12" y2="12" /><line x1="6" x2="2" y1="12" y2="12" /><line x1="12" x2="12" y1="6" y2="2" /><line x1="12" x2="12" y1="22" y2="18" />',
    },
    Database: {
      id: "icon-database",
      name: "database",
      svg: '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />',
    },
    Download: {
      id: "icon-download",
      name: "download",
      svg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />',
    },
    ExternalLink: {
      id: "icon-external-link",
      name: "external-link",
      svg: '<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />',
    },
    Eye: {
      id: "icon-eye",
      name: "eye",
      svg: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />',
    },
    EyeOff: {
      id: "icon-eye-off",
      name: "eye-off",
      svg: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />',
    },
    FileDown: {
      id: "icon-file-down",
      name: "file-down",
      svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" />',
    },
    FileText: {
      id: "icon-file-text",
      name: "file-text",
      svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
    },
    Flag: {
      id: "icon-flag",
      name: "flag",
      svg: '<path d="M5 22V4" /><path d="M5 4h11l-1.5 3L16 10H5" />',
    },
    FlaskConical: {
      id: "icon-flask-conical",
      name: "flask-conical",
      svg: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" /><path d="M6.453 15h11.094" /><path d="M8.5 2h7" />',
    },
    Focus: {
      id: "icon-focus",
      name: "focus",
      svg: '<circle cx="12" cy="12" r="3" /><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />',
    },
    FolderPlus: {
      id: "icon-folder-plus",
      name: "folder-plus",
      svg: '<path d="M12 10v6" /><path d="M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />',
    },
    Handcuffs: {
      id: "icon-handcuffs",
      name: "handcuffs",
      svg: '<circle cx="7" cy="13" r="4" /><circle cx="17" cy="13" r="4" /><path d="M11 13h2" /><path d="M7 9V5" /><path d="M4 5h6" /><path d="M17 9V5" /><path d="M14 5h6" />',
    },
    HelpCircle: {
      id: "icon-help-circle",
      name: "help-circle",
      svg: '<circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />',
    },
    Home: {
      id: "icon-house",
      name: "house",
      svg: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
    },
    Hospital: {
      id: "icon-hospital",
      name: "hospital",
      svg: '<path d="M12 7v6" /><path d="M9 10h6" /><path d="M14 21v-4a2 2 0 0 0-4 0v4" /><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" /><path d="M2 21h20" />',
    },
    ImageDown: {
      id: "icon-image-down",
      name: "image-down",
      svg: '<path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21" /><path d="m14 19 3 3v-5.5" /><path d="m17 22 3-3" /><circle cx="9" cy="9" r="2" />',
    },
    ImagePlus: {
      id: "icon-image-plus",
      name: "image-plus",
      svg: '<path d="M16 5h6" /><path d="M19 2v6" /><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /><circle cx="9" cy="9" r="2" />',
    },
    Import: {
      id: "icon-import",
      name: "import",
      svg: '<path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />',
    },
    Layers: {
      id: "icon-layers",
      name: "layers",
      svg: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
    },
    Landmark: {
      id: "icon-landmark",
      name: "landmark",
      svg: '<path d="M3 22h18" /><path d="M6 18v-7" /><path d="M10 18v-7" /><path d="M14 18v-7" /><path d="M18 18v-7" /><path d="m12 2 9 5H3z" />',
    },
    Loader2: {
      id: "icon-loader-2",
      name: "loader-2",
      svg: '<path d="M21 12a9 9 0 1 1-6.219-8.56" />',
    },
    Map: {
      id: "icon-map",
      name: "map",
      svg: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" />',
    },
    MapPin: {
      id: "icon-map-pin",
      name: "map-pin",
      svg: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" />',
    },
    MapPinned: {
      id: "icon-map-pinned",
      name: "map-pinned",
      svg: '<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0" /><circle cx="12" cy="8" r="2" /><path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712" />',
    },
    Menu: {
      id: "icon-menu",
      name: "menu",
      svg: '<path d="M4 12h16" /><path d="M4 18h16" /><path d="M4 6h16" />',
    },
    Monitor: {
      id: "icon-monitor",
      name: "monitor",
      svg: '<rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" />',
    },
    Navigation: {
      id: "icon-navigation",
      name: "navigation",
      svg: '<polygon points="3 11 22 2 13 21 11 13 3 11" />',
    },
    NotebookPen: {
      id: "icon-notebook-pen",
      name: "notebook-pen",
      svg: '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />',
    },
    Pencil: {
      id: "icon-pencil",
      name: "pencil",
      svg: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
    },
    Plus: {
      id: "icon-plus",
      name: "plus",
      svg: '<path d="M5 12h14" /><path d="M12 5v14" />',
    },
    Printer: {
      id: "icon-printer",
      name: "printer",
      svg: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" />',
    },
    Radio: {
      id: "icon-radio",
      name: "radio",
      svg: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />',
    },
    RefreshCw: {
      id: "icon-refresh-cw",
      name: "refresh-cw",
      svg: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />',
    },
    Route: {
      id: "icon-route",
      name: "route",
      svg: '<circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />',
    },
    Save: {
      id: "icon-save",
      name: "save",
      svg: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" />',
    },
    Search: {
      id: "icon-search",
      name: "search",
      svg: '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />',
    },
    ScanSearch: {
      id: "icon-scan-search",
      name: "scan-search",
      svg: '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="11" cy="11" r="3" /><path d="m16 16-2.4-2.4" />',
    },
    Shield: {
      id: "icon-shield",
      name: "shield",
      svg: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />',
    },
    Smartphone: {
      id: "icon-smartphone",
      name: "smartphone",
      svg: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />',
    },
    Star: {
      id: "icon-star",
      name: "star",
      svg: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
    },
    Tablet: {
      id: "icon-tablet",
      name: "tablet",
      svg: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2" /><line x1="12" x2="12.01" y1="18" y2="18" />',
    },
    TriangleAlert: {
      id: "icon-triangle-alert",
      name: "triangle-alert",
      svg: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />',
    },
    Trash2: {
      id: "icon-trash-2",
      name: "trash-2",
      svg: '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />',
    },
    Upload: {
      id: "icon-upload",
      name: "upload",
      svg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
    },
    UserPlus: {
      id: "icon-user-plus",
      name: "user-plus",
      svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />',
    },
    Users: {
      id: "icon-users",
      name: "users",
      svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" />',
    },
    X: {
      id: "icon-x",
      name: "x",
      svg: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    },
  };

  function svgOpen(size, extraClass) {
    var s = size || 16;
    var cls = "od-icon" + (extraClass ? " " + extraClass : "");
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="' +
      cls +
      '">'
    );
  }

  function html(name, size, extraClass) {
    var icon = hasOwn(ICONS, name) ? ICONS[name] : null;
    if (!icon) return "";
    return svgOpen(size, extraClass) + icon.svg + "</svg>";
  }

  /*
   * Semantic symbols shared by planning, case, location, and operation maps.
   * `id` is the stable stored value; `glyph` points to the visual primitive.
   */
  var MAP_ENTRIES = [
    {
      id: "Target",
      label: "Target",
      glyph: "Crosshair",
      group: "Case & planning",
      color: "#f0ad35",
      shape: "circle",
      description: "Ranked target location"
    },
    {
      id: "Arrest",
      label: "Arrest",
      glyph: "Handcuffs",
      group: "Case & planning",
      color: "#e96868",
      shape: "circle",
      description: "Arrest or custody location"
    },
    {
      id: "OfficerHome",
      label: "Officer home",
      glyph: "MapPinned",
      group: "Case & planning",
      color: "#68a8e8",
      shape: "circle",
      description: "Officer residence"
    },
    {
      id: "Origin",
      label: "Origin / find",
      glyph: "ScanSearch",
      group: "Case & planning",
      color: "#55c7bd",
      shape: "circle",
      description: "Plate check, registration, or find location"
    },
    {
      id: "Location",
      label: "Location",
      glyph: "MapPin",
      group: "Places",
      color: "#8aa0ad",
      shape: "circle",
      description: "General mapped location"
    },
    {
      id: "Residence",
      label: "Residence",
      glyph: "Home",
      group: "Places",
      color: "#55c7bd",
      shape: "circle",
      description: "Home or residence"
    },
    {
      id: "Worksite",
      label: "Worksite",
      glyph: "Building2",
      group: "Places",
      color: "#48a89f",
      shape: "circle",
      description: "Workplace or business"
    },
    {
      id: "Vehicle",
      label: "Vehicle",
      glyph: "Car",
      group: "Places",
      color: "#8b6bb8",
      shape: "circle",
      description: "Vehicle registration or sighting"
    },
    {
      id: "Parking",
      label: "Known parking",
      glyph: "CircleParking",
      group: "Places",
      color: "#a78bfa",
      shape: "circle",
      description: "Known parking location"
    },
    {
      id: "OfficerStart",
      label: "Officer start",
      glyph: "Navigation",
      group: "Operations",
      color: "#68a8e8",
      shape: "wedge",
      description: "Officer start point and heading"
    },
    {
      id: "RallyPoint",
      label: "Rally point",
      glyph: "Flag",
      group: "Operations",
      color: "#b49add",
      shape: "circle",
      description: "Rally or regroup location"
    },
    {
      id: "StagingArea",
      label: "Staging area",
      glyph: "Layers",
      group: "Operations",
      color: "#71d7ce",
      shape: "circle",
      description: "Staging location"
    },
    {
      id: "Cleanup",
      label: "Cleanup point",
      glyph: "CircleCheck",
      group: "Operations",
      color: "#b49add",
      shape: "circle",
      description: "Operation cleanup or end point"
    },
    {
      id: "Medevac",
      label: "Medevac",
      glyph: "CirclePlus",
      group: "Operations",
      color: "#6fcf97",
      shape: "diamond",
      description: "Medevac pickup location"
    },
    {
      id: "Hospital",
      label: "Hospital",
      glyph: "Hospital",
      group: "Operations",
      color: "#6fcf97",
      shape: "diamond",
      description: "Hospital or medical facility"
    },
    {
      id: "Landmark",
      label: "Landmark",
      glyph: "Landmark",
      group: "Operations",
      color: "#aab7c0",
      shape: "circle",
      description: "Named landmark"
    },
    {
      id: "Surveillance",
      label: "Surveillance",
      glyph: "Eye",
      group: "Awareness",
      color: "#55c7bd",
      shape: "circle",
      description: "Surveillance position"
    },
    {
      id: "Contact",
      label: "Contact point",
      glyph: "Radio",
      group: "Awareness",
      color: "#68a8e8",
      shape: "circle",
      description: "Contact or communications point"
    },
    {
      id: "Evidence",
      label: "Evidence",
      glyph: "Archive",
      group: "Awareness",
      color: "#f0ad35",
      shape: "circle",
      description: "Evidence or property location"
    },
    {
      id: "Hazard",
      label: "Hazard",
      glyph: "TriangleAlert",
      group: "Awareness",
      color: "#f47b5c",
      shape: "circle",
      description: "Hazard or safety concern"
    },
    {
      id: "SearchArea",
      label: "Search area",
      glyph: "Focus",
      group: "Awareness",
      color: "#71d7ce",
      shape: "circle",
      description: "Search or focus area"
    },
    {
      id: "TargetFinalOrder",
      label: "Final order",
      glyph: "Flag",
      group: "Target flags",
      color: "#c45c26",
      shape: "circle",
      description: "Target with a final order of removal"
    },
    {
      id: "TargetReinstate",
      label: "Reinstatement",
      glyph: "Import",
      group: "Target flags",
      color: "#8b5a2b",
      shape: "square",
      description: "Target eligible for reinstatement of removal"
    },
    {
      id: "TargetCriminal",
      label: "Criminal target",
      glyph: "Handcuffs",
      group: "Target flags",
      color: "#e96868",
      shape: "square",
      description: "Target with a criminal record or warrant"
    },
    {
      id: "EncounterFled",
      label: "Fled",
      glyph: "Navigation",
      group: "Encounter flags",
      color: "#b58bea",
      shape: "wedge",
      description: "Encounter where a subject fled"
    },
    {
      id: "EncounterCollision",
      label: "Collision",
      glyph: "TriangleAlert",
      group: "Encounter flags",
      color: "#f0ad35",
      shape: "diamond",
      description: "Encounter with a vehicle collision"
    }
  ];

  function normalizedMapKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  var MAP_BY_KEY = Object.create(null);
  MAP_ENTRIES.forEach(function (entry) {
    MAP_BY_KEY[normalizedMapKey(entry.id)] = entry;
    MAP_BY_KEY[normalizedMapKey(entry.label)] = entry;
  });

  var MAP_KIND_IDS = Object.assign(Object.create(null), {
    target: "Target",
    targets: "Target",
    arrest: "Arrest",
    arrests: "Arrest",
    officer: "OfficerHome",
    officers: "OfficerHome",
    officerhome: "OfficerHome",
    origin: "Origin",
    originfind: "Origin",
    platecheck: "Origin",
    registration: "Vehicle",
    home: "Residence",
    residence: "Residence",
    work: "Worksite",
    workplace: "Worksite",
    vehicle: "Vehicle",
    parking: "Parking",
    knownparking: "Parking",
    stop: "Location",
    other: "Location",
    officerstart: "OfficerStart",
    rally: "RallyPoint",
    rallypoint: "RallyPoint",
    staging: "StagingArea",
    stagingarea: "StagingArea",
    cleanup: "Cleanup",
    medevac: "Medevac",
    hospital: "Hospital",
    landmark: "Landmark",
    surveillance: "Surveillance",
    contact: "Contact",
    evidence: "Evidence",
    hazard: "Hazard",
    search: "SearchArea",
    searcharea: "SearchArea"
  });

  var MAP_LIBRARIES = [
    {
      id: "standard",
      label: "Field Ops",
      description: "Balanced filled markers with direct operational symbols.",
      defaultShape: "",
      symbols: Object.create(null)
    },
    {
      id: "tactical",
      label: "Tactical",
      description: "Angular dark markers with heavier mission-oriented symbols.",
      defaultShape: "square",
      symbols: {
        Target: { glyph: "Focus" },
        OfficerHome: { glyph: "Shield" },
        Origin: { glyph: "Route" },
        Location: { glyph: "Navigation" },
        Residence: { glyph: "MapPinned" },
        Worksite: { glyph: "Landmark" },
        OfficerStart: { glyph: "Navigation", shape: "wedge" },
        RallyPoint: { glyph: "Users" },
        Cleanup: { glyph: "Check" },
        Medevac: { glyph: "Plus", shape: "diamond" },
        Hospital: { glyph: "CirclePlus", shape: "diamond" },
        Landmark: { glyph: "Map" },
        Evidence: { glyph: "Database" },
        SearchArea: { glyph: "ScanSearch" }
      }
    },
    {
      id: "atlas",
      label: "Atlas",
      description: "Classic cartographic pins with a warm paper treatment.",
      defaultShape: "pin",
      symbols: {
        Target: { glyph: "Star" },
        OfficerHome: { glyph: "Shield" },
        Origin: { glyph: "MapPinned" },
        StagingArea: { glyph: "Map" },
        SearchArea: { glyph: "Search" }
      }
    },
    {
      id: "minimal",
      label: "Minimal",
      description: "Quiet outline markers with simplified, low-noise symbols.",
      defaultShape: "circle",
      symbols: {
        OfficerHome: { glyph: "Shield" },
        Origin: { glyph: "Search" },
        Cleanup: { glyph: "Check" },
        Medevac: { glyph: "Plus", shape: "diamond" },
        Hospital: { glyph: "Hospital", shape: "diamond" },
        SearchArea: { glyph: "Focus" }
      }
    }
  ];
  var MAP_LIBRARY_BY_ID = Object.create(null);
  MAP_LIBRARIES.forEach(function (library) {
    MAP_LIBRARY_BY_ID[library.id] = library;
  });
  var MAP_LIBRARY_ALIASES = Object.assign(Object.create(null), {
    default: "standard",
    field: "standard",
    fieldops: "standard",
    standard: "standard",
    command: "tactical",
    tactical: "tactical",
    atlas: "atlas",
    cartographic: "atlas",
    minimal: "minimal",
    outline: "minimal"
  });

  function resolveMapLibraryId(value) {
    var key = normalizedMapKey(value);
    var id = hasOwn(MAP_LIBRARY_ALIASES, key)
      ? MAP_LIBRARY_ALIASES[key]
      : key;
    return hasOwn(MAP_LIBRARY_BY_ID, id) ? id : "standard";
  }

  function loadMapLibraryId() {
    try {
      var stored = g.COPDoc.repositories.viewState.loadMapIcons();
      return resolveMapLibraryId(stored && stored.libraryId);
    } catch (err) {
      return "standard";
    }
  }

  function persistMapLibraryId(id) {
    try {
      g.COPDoc.repositories.viewState.saveMapIconLibrary(id);
    } catch (err) {}
  }

  var activeMapLibraryId = loadMapLibraryId();

  function mapLibrary(libraryId) {
    var id =
      libraryId == null || libraryId === ""
        ? activeMapLibraryId
        : resolveMapLibraryId(libraryId);
    return MAP_LIBRARY_BY_ID[id] || MAP_LIBRARY_BY_ID.standard;
  }

  function baseMapEntry(name) {
    return MAP_BY_KEY[normalizedMapKey(name)] || null;
  }

  function mapEntry(name, libraryId) {
    var entry = baseMapEntry(name);
    if (!entry) return null;
    var library = mapLibrary(libraryId);
    var symbol = hasOwn(library.symbols, entry.id)
      ? library.symbols[entry.id]
      : null;
    return Object.assign({}, entry, {
      glyph: symbol && symbol.glyph ? symbol.glyph : entry.glyph,
      shape:
        symbol && symbol.shape
          ? symbol.shape
          : library.defaultShape || entry.shape,
      libraryId: library.id
    });
  }

  function mapEntriesFor(libraryId) {
    return MAP_ENTRIES.map(function (entry) {
      return mapEntry(entry.id, libraryId);
    });
  }

  var ACTIVE_MAP_ENTRIES = mapEntriesFor(activeMapLibraryId);

  function syncActiveMapEntries() {
    var next = mapEntriesFor(activeMapLibraryId);
    ACTIVE_MAP_ENTRIES.splice.apply(
      ACTIVE_MAP_ENTRIES,
      [0, ACTIVE_MAP_ENTRIES.length].concat(next)
    );
  }

  function dispatchMapLibraryChange(id) {
    if (!g.document || typeof g.document.dispatchEvent !== "function") return;
    var event = null;
    if (typeof g.CustomEvent === "function") {
      event = new g.CustomEvent("copdoc:map-icon-librarychange", {
        detail: { libraryId: id }
      });
    } else if (typeof g.document.createEvent === "function") {
      event = g.document.createEvent("CustomEvent");
      event.initCustomEvent(
        "copdoc:map-icon-librarychange",
        false,
        false,
        { libraryId: id }
      );
    }
    if (event) g.document.dispatchEvent(event);
  }

  function setMapLibrary(libraryId, options) {
    options = options || {};
    activeMapLibraryId = resolveMapLibraryId(libraryId);
    syncActiveMapEntries();
    if (options.persist !== false) persistMapLibraryId(activeMapLibraryId);
    if (options.notify !== false) dispatchMapLibraryChange(activeMapLibraryId);
    return activeMapLibraryId;
  }

  function mapEntryForKind(kind, libraryId) {
    var key = normalizedMapKey(kind);
    var id = hasOwn(MAP_KIND_IDS, key) ? MAP_KIND_IDS[key] : "Location";
    return mapEntry(id, libraryId);
  }

  function mapGlyphName(name, libraryId) {
    var entry = mapEntry(name, libraryId);
    if (entry) return entry.glyph;
    return hasOwn(ICONS, name) ? name : "MapPin";
  }

  function mapIconHtml(name, size, extraClass, options) {
    if (extraClass && typeof extraClass === "object") {
      options = extraClass;
      extraClass = "";
    }
    options = options || {};
    var libraryId = options.libraryId || options.theme;
    return html(mapGlyphName(name, libraryId), size, extraClass);
  }

  function safeMapColor(value, fallback) {
    var color = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return (
        "#" +
        color.charAt(1) + color.charAt(1) +
        color.charAt(2) + color.charAt(2) +
        color.charAt(3) + color.charAt(3)
      ).toLowerCase();
    }
    return fallback || "#8aa0ad";
  }

  function colorWithAlpha(hex, alpha) {
    var color = safeMapColor(hex, "#8aa0ad");
    var n = parseInt(color.slice(1), 16);
    var a = Math.max(0, Math.min(1, Number(alpha)));
    if (!isFinite(a)) {
      a = 0.4;
    }
    return (
      "rgba(" +
      ((n >> 16) & 255) +
      "," +
      ((n >> 8) & 255) +
      "," +
      (n & 255) +
      "," +
      a +
      ")"
    );
  }

  function mapColorIsLight(value) {
    var color = safeMapColor(value, "#8aa0ad");
    var n = parseInt(color.slice(1), 16);
    var channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(
      function (channel) {
        var ratio = channel / 255;
        return ratio <= 0.04045
          ? ratio / 12.92
          : Math.pow((ratio + 0.055) / 1.055, 2.4);
      }
    );
    var luminance =
      0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    var darkInkLuminance = 0.005;
    var lightInkLuminance = 0.96;
    var darkContrast = (luminance + 0.05) / (darkInkLuminance + 0.05);
    var lightContrast = (lightInkLuminance + 0.05) / (luminance + 0.05);
    return darkContrast >= lightContrast;
  }

  function escapeMapText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function mapBadgeHtml(name, options) {
    options = options || {};
    var library = mapLibrary(options.libraryId || options.theme);
    var entry = mapEntry(name, library.id);
    var glyph = mapGlyphName(name, library.id);
    var shape = entry ? entry.shape : library.defaultShape || "circle";
    var color = safeMapColor(options.color, entry && entry.color);
    var sizeName = options.size || (options.primary ? "primary" : "standard");
    var pixels =
      typeof sizeName === "number"
        ? Math.max(20, Math.min(56, sizeName))
        : sizeName === "compact"
          ? 24
          : sizeName === "primary"
            ? 38
            : 32;
    var glyphSize = Math.max(12, pixels - 2);
    var classes = [
      "copdoc-map-symbol",
      "is-library-" + library.id,
      "is-shape-" + shape,
      pixels <= 24 ? "is-compact" : ""
    ];
    if (options.primary) classes.push("is-primary");
    if (options.selected) classes.push("is-selected");
    if (options.editable) classes.push("is-editable");
    var badge = options.badge == null ? "" : String(options.badge).slice(0, 3);
    var stroke =
      typeof options.stroke === "number" && isFinite(options.stroke)
        ? Math.max(1, Math.min(4, options.stroke))
        : 2;
    var inkWeight = (1.1 + stroke * 0.55).toFixed(2);
    var fillOpacity =
      typeof options.fillOpacity === "number" && isFinite(options.fillOpacity)
        ? Math.max(0, Math.min(1, options.fillOpacity))
        : 0.4;
    var fill = colorWithAlpha(color, fillOpacity);
    return (
      '<span class="' +
      classes.filter(Boolean).join(" ") +
      '" style="--map-symbol-color:' +
      color +
      ";--map-symbol-fill:" +
      fill +
      ";--map-symbol-line:#081018;--map-symbol-size:" +
      pixels +
      "px;--map-symbol-stroke:" +
      stroke +
      "px;--map-symbol-ink-weight:" +
      inkWeight +
      '">' +
      html(glyph, glyphSize, "copdoc-map-symbol-glyph") +
      (badge
        ? '<i class="copdoc-map-symbol-badge">' + escapeMapText(badge) + "</i>"
        : "") +
      "</span>"
    );
  }

  var mapIcons = {
    entries: ACTIVE_MAP_ENTRIES,
    names: MAP_ENTRIES.map(function (entry) {
      return entry.id;
    }),
    libraries: MAP_LIBRARIES.map(function (library) {
      return {
        id: library.id,
        label: library.label,
        description: library.description
      };
    }),
    themes: MAP_LIBRARIES.map(function (library) {
      return {
        id: library.id,
        label: library.label,
        description: library.description
      };
    }),
    entry: mapEntry,
    forKind: mapEntryForKind,
    entriesFor: mapEntriesFor,
    entriesForTheme: mapEntriesFor,
    getLibraryId: function () {
      return activeMapLibraryId;
    },
    getTheme: function () {
      return activeMapLibraryId;
    },
    setLibrary: setMapLibrary,
    setTheme: setMapLibrary,
    html: mapIconHtml,
    badgeHtml: mapBadgeHtml,
    color: function (name, libraryId) {
      var entry = mapEntry(name, libraryId);
      return entry ? entry.color : "#8aa0ad";
    },
    label: function (name) {
      var entry = mapEntry(name);
      if (entry) return entry.label;
      if (hasOwn(ICONS, name)) {
        return String(name).replace(/([a-z])([A-Z])/g, "$1 $2");
      }
      return "Location";
    },
    isKnown: function (name) {
      return !!mapEntry(name) || hasOwn(ICONS, name);
    }
  };

  function use(name, size) {
    var icon = hasOwn(ICONS, name) ? ICONS[name] : null;
    if (!icon) return "";
    var s = size || 16;
    return (
      '<svg class="od-icon" width="' +
      s +
      '" height="' +
      s +
      '" aria-hidden="true"><use href="#' +
      icon.id +
      '"></use></svg>'
    );
  }

  var sprite =
    '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
  Object.keys(ICONS).forEach(function (k) {
    var icon = ICONS[k];
    sprite +=
      '<symbol id="' +
      icon.id +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      icon.svg +
      "</symbol>";
  });
  sprite += "</svg>";

  var api = {
    ICONS: ICONS,
    names: Object.keys(ICONS).sort(),
    map: mapIcons,
    html: html,
    use: use,
    sprite: sprite,
    inject: function () {
      if (document.getElementById("copdoc-icon-sprite")) return;
      var wrap = document.createElement("div");
      wrap.id = "copdoc-icon-sprite";
      wrap.setAttribute("hidden", "");
      wrap.innerHTML = sprite;
      (document.body || document.documentElement).insertBefore(
        wrap,
        document.body ? document.body.firstChild : null
      );
    },
  };

  // Dual export: COPDoc.icons (preferred) + OpDocIcons (compat with snippet)
  g.OpDocIcons = api;
  var COPDoc = (g.COPDoc = g.COPDoc || {});
  COPDoc.icons = api;
  COPDoc.mapIcons = mapIcons;

  /** Convenience: COPDoc.icon("MapPin", 18) */
  COPDoc.icon = function icon(name, size, extraClass) {
    return html(name, size, extraClass);
  };
})(typeof window !== "undefined" ? window : globalThis);
