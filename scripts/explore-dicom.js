#!/usr/bin/env node
/**
 * Script to explore DICOM metadata from sample files
 * Run with: node scripts/explore-dicom.js
 */

const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');

// DICOM tag definitions for reference
const TAGS = {
  // Patient
  PatientName: 'x00100010',
  PatientID: 'x00100020',

  // Study
  StudyDescription: 'x00081030',
  StudyDate: 'x00080020',
  StudyInstanceUID: 'x0020000d',

  // Series - these are what we care about for labeling
  SeriesDescription: 'x0008103e',
  SeriesNumber: 'x00200011',
  SeriesInstanceUID: 'x0020000e',
  ProtocolName: 'x00181030',
  BodyPartExamined: 'x00180015',

  // Image
  ImageType: 'x00080008',
  SOPClassUID: 'x00080016',
  Modality: 'x00080060',

  // Sequence info
  SequenceName: 'x00180024',
  ScanningSequence: 'x00180020',
  SequenceVariant: 'x00180021',
  MRAcquisitionType: 'x00180023',

  // Additional useful fields
  Manufacturer: 'x00080070',
  InstitutionName: 'x00080080',
  SliceThickness: 'x00180050',
  RepetitionTime: 'x00180080',
  EchoTime: 'x00180081',
};

function readDicomFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const byteArray = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return dicomParser.parseDicom(byteArray);
}

function getString(dataSet, tag) {
  try {
    return dataSet.string(tag) || null;
  } catch {
    return null;
  }
}

function exploreFile(filePath) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`File: ${filePath}`);
  console.log(`Folder: ${path.basename(path.dirname(filePath))}`);
  console.log('='.repeat(80));

  try {
    const dataSet = readDicomFile(filePath);

    console.log('\n--- Key Metadata ---');
    for (const [name, tag] of Object.entries(TAGS)) {
      const value = getString(dataSet, tag);
      if (value) {
        console.log(`  ${name.padEnd(25)} (${tag}): ${value}`);
      }
    }

    // Also dump some raw elements to see what else is available
    console.log('\n--- All String Elements (first 50) ---');
    let count = 0;
    for (const tag in dataSet.elements) {
      if (count >= 50) break;
      const element = dataSet.elements[tag];
      if (element.vr === 'LO' || element.vr === 'SH' || element.vr === 'CS' || element.vr === 'PN' || element.vr === 'DA' || element.vr === 'TM') {
        const value = getString(dataSet, tag);
        if (value && value.length > 0 && value.length < 100) {
          console.log(`  ${tag} (${element.vr}): ${value}`);
          count++;
        }
      }
    }

    return {
      folder: path.basename(path.dirname(filePath)),
      seriesDescription: getString(dataSet, TAGS.SeriesDescription),
      protocolName: getString(dataSet, TAGS.ProtocolName),
      bodyPart: getString(dataSet, TAGS.BodyPartExamined),
      seriesNumber: getString(dataSet, TAGS.SeriesNumber),
      sequenceName: getString(dataSet, TAGS.SequenceName),
    };
  } catch (err) {
    console.error(`  Error parsing: ${err.message}`);
    return null;
  }
}

// Main
const sampleDir = path.join(__dirname, '..', 'sample_data');
const studyDirs = fs.readdirSync(sampleDir).filter(f =>
  fs.statSync(path.join(sampleDir, f)).isDirectory()
);

const seriesSummary = [];

for (const studyDir of studyDirs) {
  const studyPath = path.join(sampleDir, studyDir);
  const seriesDirs = fs.readdirSync(studyPath).filter(f =>
    fs.statSync(path.join(studyPath, f)).isDirectory()
  );

  console.log(`\n\n${'#'.repeat(80)}`);
  console.log(`# Study: ${studyDir}`);
  console.log(`# Series folders: ${seriesDirs.length}`);
  console.log('#'.repeat(80));

  for (const seriesDir of seriesDirs) {
    const seriesPath = path.join(studyPath, seriesDir);
    const dcmFiles = fs.readdirSync(seriesPath).filter(f => f.endsWith('.dcm'));

    if (dcmFiles.length > 0) {
      // Just read the first file from each series
      const firstFile = path.join(seriesPath, dcmFiles[0]);
      const info = exploreFile(firstFile);
      if (info) {
        seriesSummary.push(info);
      }
    }
  }
}

// Print summary
console.log('\n\n');
console.log('='.repeat(80));
console.log('SUMMARY: Folder Name vs DICOM Metadata');
console.log('='.repeat(80));
console.log('\n');
console.log('Folder Name'.padEnd(35), '| Series Description'.padEnd(35), '| Protocol Name');
console.log('-'.repeat(35), '|', '-'.repeat(33), '|', '-'.repeat(30));

for (const info of seriesSummary) {
  console.log(
    (info.folder || '').padEnd(35),
    '|',
    (info.seriesDescription || 'N/A').padEnd(33),
    '|',
    (info.protocolName || 'N/A')
  );
}
