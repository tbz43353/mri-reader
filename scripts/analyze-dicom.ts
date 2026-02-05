#!/usr/bin/env npx tsx
/**
 * Script to analyze DICOM files and understand their structure
 * Run with: npx tsx scripts/analyze-dicom.ts
 */
import fs from 'fs';
import path from 'path';
import dicomParser from 'dicom-parser';

// Transfer Syntax UIDs and their descriptions
const TRANSFER_SYNTAXES: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian (Uncompressed)',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian (Uncompressed)',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian (Uncompressed)',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline (Process 1)',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (Process 2 & 4)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless, Non-Hierarchical (Process 14)',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless, Non-Hierarchical, First-Order Prediction',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS Lossy (Near-Lossless)',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless Only',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
};

interface PixelDataElement {
  tag: string;
  vr?: string;
  length: number;
  dataOffset: number;
  encapsulatedPixelData?: boolean;
  basicOffsetTable?: number[];
  fragments?: Array<{ offset: number; length: number }>;
}

function analyzeDicomFile(filePath: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(`File: ${filePath}`);
  console.log('='.repeat(80));

  const buffer = fs.readFileSync(filePath);
  const byteArray = new Uint8Array(buffer);

  console.log(`File size: ${buffer.length} bytes`);

  try {
    const dataSet = dicomParser.parseDicom(byteArray);

    // Transfer Syntax
    const transferSyntax = dataSet.string('x00020010');
    const transferSyntaxName = transferSyntax ? (TRANSFER_SYNTAXES[transferSyntax] || 'Unknown') : 'Not found';
    console.log(`\nTransfer Syntax: ${transferSyntax}`);
    console.log(`  Description: ${transferSyntaxName}`);

    // Image dimensions
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const bitsAllocated = dataSet.uint16('x00280100');
    const bitsStored = dataSet.uint16('x00280101');
    const highBit = dataSet.uint16('x00280102');
    const pixelRepresentation = dataSet.uint16('x00280103');
    const samplesPerPixel = dataSet.uint16('x00280002');
    const photometricInterpretation = dataSet.string('x00280004');

    console.log(`\nImage Properties:`);
    console.log(`  Dimensions: ${columns} x ${rows}`);
    console.log(`  Bits Allocated: ${bitsAllocated}`);
    console.log(`  Bits Stored: ${bitsStored}`);
    console.log(`  High Bit: ${highBit}`);
    console.log(`  Pixel Representation: ${pixelRepresentation} (${pixelRepresentation === 0 ? 'unsigned' : 'signed'})`);
    console.log(`  Samples Per Pixel: ${samplesPerPixel}`);
    console.log(`  Photometric Interpretation: ${photometricInterpretation}`);

    // Pixel Data
    const pixelDataElement = dataSet.elements['x7fe00010'] as PixelDataElement | undefined;
    console.log(`\nPixel Data Element (7FE0,0010):`);

    if (pixelDataElement) {
      console.log(`  Tag: ${pixelDataElement.tag}`);
      console.log(`  VR: ${pixelDataElement.vr || 'undefined'}`);
      console.log(`  Length: ${pixelDataElement.length}`);
      console.log(`  Data Offset: ${pixelDataElement.dataOffset}`);
      console.log(`  Has Encapsulated Pixel Data: ${!!pixelDataElement.encapsulatedPixelData}`);

      if (pixelDataElement.encapsulatedPixelData) {
        console.log(`  Basic Offset Table: ${pixelDataElement.basicOffsetTable?.length || 0} entries`);
        console.log(`  Number of Fragments: ${pixelDataElement.fragments?.length || 0}`);

        if (pixelDataElement.fragments && pixelDataElement.fragments.length > 0) {
          console.log(`  Fragment sizes:`);
          pixelDataElement.fragments.slice(0, 5).forEach((frag, i) => {
            console.log(`    Fragment ${i}: offset=${frag.offset}, length=${frag.length}`);
          });
          if (pixelDataElement.fragments.length > 5) {
            console.log(`    ... and ${pixelDataElement.fragments.length - 5} more fragments`);
          }
        }
      } else {
        // Check if we can read raw pixel data
        const expectedSize = (rows ?? 0) * (columns ?? 0) * ((bitsAllocated ?? 16) / 8) * (samplesPerPixel ?? 1);
        console.log(`  Expected size (uncompressed): ${expectedSize} bytes`);
        console.log(`  Actual length: ${pixelDataElement.length} bytes`);

        if (pixelDataElement.length === 0xFFFFFFFF) {
          console.log(`  ⚠️  Undefined length - likely encapsulated but not parsed correctly`);
        }
      }
    } else {
      console.log(`  ❌ NOT FOUND!`);

      // List all elements to debug
      console.log(`\n  Available elements (last 20):`);
      const elementTags = Object.keys(dataSet.elements).sort();
      elementTags.slice(-20).forEach(tag => {
        const el = dataSet.elements[tag];
        console.log(`    ${tag}: vr=${el.vr}, length=${el.length}`);
      });
    }

    // Check for compression indicators
    const isCompressed = transferSyntax && !transferSyntax.startsWith('1.2.840.10008.1.2.1') &&
                         !transferSyntax.startsWith('1.2.840.10008.1.2.2') &&
                         transferSyntax !== '1.2.840.10008.1.2';

    console.log(`\n📋 Summary:`);
    console.log(`  Compressed: ${isCompressed ? 'YES' : 'NO'}`);
    console.log(`  Encapsulated: ${pixelDataElement?.encapsulatedPixelData ? 'YES' : 'NO'}`);
    console.log(`  Pixel data present: ${pixelDataElement ? 'YES' : 'NO'}`);

  } catch (error) {
    console.log(`\n❌ Error parsing DICOM: ${error instanceof Error ? error.message : error}`);
  }
}

// Main
const sampleDir = './sample_data/tony_b_wb_2025-12-12_1912';

// Get subdirectories
const subdirs = fs.readdirSync(sampleDir).filter(f =>
  fs.statSync(path.join(sampleDir, f)).isDirectory()
);

console.log('Available series:', subdirs);
console.log('\nAnalyzing first file from each series...\n');

// Analyze first file from each series
for (const subdir of subdirs.slice(0, 5)) {
  const seriesPath = path.join(sampleDir, subdir);
  const files = fs.readdirSync(seriesPath).filter(f => f.endsWith('.dcm'));
  if (files.length > 0) {
    analyzeDicomFile(path.join(seriesPath, files[0]));
  }
}
