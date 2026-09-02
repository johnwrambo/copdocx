"use strict";

var zlib = require("zlib");
var contract = require("./release-contract");

var CRC_TABLE = new Uint32Array(256);
for (var i = 0; i < 256; i += 1) {
  var c = i;
  for (var k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  var crc = 0xffffffff;
  for (var i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

var DOS_TIME = 0;
var DOS_DATE = 0x0021; // 1980-01-01
var VERSION_NEEDED = 20;
var VERSION_MADE_BY = 0x0314; // Unix, 2.0
var FLAGS_UTF8 = 0x0800;
var METHOD_DEFLATE = 8;
var UNIX_FILE_ATTR = (0o100644 << 16) >>> 0;

function buildZip(files) {
  var localParts = [];
  var centralParts = [];
  var offset = 0;
  var count = files.length;

  for (var i = 0; i < count; i += 1) {
    var file = files[i];
    var name = contract.assertSafeRelPath(file.name);
    var nameBuf = Buffer.from(name, "utf8");
    var uncompressed = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    var compressed = zlib.deflateRawSync(uncompressed, { level: 9 });
    var crc = crc32(uncompressed);

    var local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAGS_UTF8, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressed.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, compressed);
    var localHeaderOffset = offset;
    offset += local.length + nameBuf.length + compressed.length;

    var central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAGS_UTF8, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(UNIX_FILE_ATTR, 38);
    central.writeUInt32LE(localHeaderOffset, 42);
    centralParts.push(central, nameBuf);
  }

  var localBlob = Buffer.concat(localParts);
  var centralBlob = Buffer.concat(centralParts);
  var eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBlob, centralBlob, eocd]);
}

function listZipEntries(buffer) {
  var entries = [];
  var offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    var nameLen = buffer.readUInt16LE(offset + 26);
    var extraLen = buffer.readUInt16LE(offset + 28);
    var method = buffer.readUInt16LE(offset + 8);
    var compressedSize = buffer.readUInt32LE(offset + 18);
    var name = buffer.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    contract.assertSafeRelPath(name);
    if (extraLen !== 0) {
      throw new Error("zip extra field is not allowed: " + name);
    }
    if (method !== METHOD_DEFLATE) {
      throw new Error("zip method must be deflate: " + name);
    }
    var dataStart = offset + 30 + nameLen;
    offset = dataStart + compressedSize;
    entries.push(name);
  }
  return entries;
}

module.exports = {
  crc32: crc32,
  buildZip: buildZip,
  listZipEntries: listZipEntries
};
