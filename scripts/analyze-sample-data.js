#!/usr/bin/env node

/**
 * Script to analyze DICOM files and identify SR, KO, PR, and Overlay files
 * for testing the new non-image DICOM support features.
 */

const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');

// SOP Class UIDs for non-image DICOM objects
const SR_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.88.11', // Basic Text SR
  '1.2.840.10008.5.1.4.1.1.88.22', // Enhanced SR
  '1.2.840.10008.5.1.4.1.1.88.33', // Comprehensive SR
  '1.2.840.10008.5.1.4.1.1.88.34', // Comprehensive 3D SR
  '1.2.840.10008.5.1.4.1.1.88.35', // Extensible SR
  '1.2.840.10008.5.1.4.1.1.88.40', // Procedure Log
  '1.2.840.10008.5.1.4.1.1.88.50', // Mammography CAD SR
  '1.2.840.10008.5.1.4.1.1.88.65', // Chest CAD SR
  '1.2.840.10008.5.1.4.1.1.88.67', // X-Ray Radiation Dose SR
  '1.2.840.10008.5.1.4.1.1.88.68', // Radiopharmaceutical Radiation Dose SR
  '1.2.840.10008.5.1.4.1.1.88.69', // Colon CAD SR
  '1.2.840.10008.5.1.4.1.1.88.70', // Implantation Plan SR
];

const KO_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.88.59'; // Key Object Selection

const PR_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.11.1', // Grayscale Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.2', // Color Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.3', // Pseudo-Color Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.4', // Blending Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.5', // XA/XRF Grayscale Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.6', // Grayscale Planar MPR Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.7', // Compositing Planar MPR Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.8', // Advanced Blending Presentation State
  '1.2.840.10008.5.1.4.1.1.11.9', // Volume Rendering Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.10', // Segmented Volume Rendering Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.11', // Multiple Volume Rendering Volumetric Presentation State
];

// Results storage
const results = {
  sr: [],
  ko: [],
  pr: [],
  overlays: [],
  images: [],
  errors: [],
};

function analyzeFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    const sopClassUID = dataSet.string('x00080016');
    const modality = dataSet.string('x00080060');
    const seriesDescription = dataSet.string('x0008103e') || 'No description';

    // Check for SR
    if (SR_SOP_CLASSES.includes(sopClassUID)) {
      const completionFlag = dataSet.string('x0040a491') || 'N/A';
      const verificationFlag = dataSet.string('x0040a493') || 'N/A';
      results.sr.push({
        path: filePath,
        modality,
        seriesDescription,
        completionFlag,
        verificationFlag,
        sopClassUID,
      });
      return 'SR';
    }

    // Check for KO
    if (sopClassUID === KO_SOP_CLASS) {
      // Count referenced images
      const contentSeq = dataSet.elements['x0040a730'];
      let keyImageCount = 0;
      if (contentSeq?.items) {
        for (const item of contentSeq.items) {
          if (item.dataSet) {
            const valueType = item.dataSet.string('x0040a040');
            if (valueType === 'IMAGE') {
              keyImageCount++;
            }
          }
        }
      }
      results.ko.push({
        path: filePath,
        modality,
        seriesDescription,
        keyImageCount,
        sopClassUID,
      });
      return 'KO';
    }

    // Check for PR
    if (PR_SOP_CLASSES.includes(sopClassUID)) {
      // Check for graphic annotations
      const graphicAnnotationSeq = dataSet.elements['x00700001'];
      const hasAnnotations = graphicAnnotationSeq?.items?.length > 0;

      // Check for VOI LUT
      const voiLutSeq = dataSet.elements['x00283110'];
      const hasVoiLut = voiLutSeq?.items?.length > 0;

      results.pr.push({
        path: filePath,
        modality,
        seriesDescription,
        hasAnnotations,
        annotationCount: graphicAnnotationSeq?.items?.length || 0,
        hasVoiLut,
        sopClassUID,
      });
      return 'PR';
    }

    // Check for pixel data (image file)
    const pixelData = dataSet.elements['x7fe00010'];
    if (pixelData) {
      // Check for graphic overlays (60xx groups)
      const overlayGroups = [];
      for (let group = 0x6000; group <= 0x601e; group += 2) {
        const prefix = group.toString(16).padStart(4, '0');
        const overlayRows = dataSet.uint16(`x${prefix}0010`);
        if (overlayRows) {
          const overlayColumns = dataSet.uint16(`x${prefix}0011`);
          const overlayType = dataSet.string(`x${prefix}0040`) || 'G';
          const overlayLabel = dataSet.string(`x${prefix}1500`) || '';
          overlayGroups.push({
            group: `0x${group.toString(16).toUpperCase()}`,
            rows: overlayRows,
            columns: overlayColumns,
            type: overlayType,
            label: overlayLabel,
          });
        }
      }

      if (overlayGroups.length > 0) {
        results.overlays.push({
          path: filePath,
          modality,
          seriesDescription,
          overlayGroups,
        });
        return 'OVERLAY';
      }

      results.images.push({
        path: filePath,
        modality,
        seriesDescription,
      });
      return 'IMAGE';
    }

    // Unknown non-image file
    return 'UNKNOWN';
  } catch (err) {
    results.errors.push({
      path: filePath,
      error: err.message,
    });
    return 'ERROR';
  }
}

function walkDir(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      // Try to parse as DICOM (no extension check - DICOM files often lack extensions)
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  const sampleDataPath = process.argv[2] || path.join(__dirname, '../sample_data/tony_b_wb_2025-12-12_1912');

  if (!fs.existsSync(sampleDataPath)) {
    console.error(`Sample data path not found: ${sampleDataPath}`);
    process.exit(1);
  }

  console.log(`\n📂 Analyzing DICOM files in: ${sampleDataPath}\n`);
  console.log('━'.repeat(80));

  const files = walkDir(sampleDataPath);
  console.log(`Found ${files.length} files to analyze...\n`);

  let processed = 0;
  for (const file of files) {
    analyzeFile(file);
    processed++;
    if (processed % 100 === 0) {
      process.stdout.write(`  Processed ${processed}/${files.length} files...\r`);
    }
  }
  console.log(`  Processed ${processed}/${files.length} files.\n`);

  // Print results
  console.log('━'.repeat(80));
  console.log('\n📋 ANALYSIS RESULTS\n');
  console.log('━'.repeat(80));

  // Structured Reports
  console.log(`\n📄 STRUCTURED REPORTS (SR): ${results.sr.length} files found`);
  if (results.sr.length > 0) {
    console.log('   These contain radiologist findings and measurements.\n');
    for (const sr of results.sr) {
      const relativePath = path.relative(sampleDataPath, sr.path);
      console.log(`   📍 ${relativePath}`);
      console.log(`      Description: ${sr.seriesDescription}`);
      console.log(`      Status: ${sr.completionFlag} / ${sr.verificationFlag}`);
      console.log();
    }
  }

  // Key Object Selection
  console.log(`\n⭐ KEY OBJECT SELECTION (KO): ${results.ko.length} files found`);
  if (results.ko.length > 0) {
    console.log('   These mark important images identified by the radiologist.\n');
    for (const ko of results.ko) {
      const relativePath = path.relative(sampleDataPath, ko.path);
      console.log(`   📍 ${relativePath}`);
      console.log(`      Description: ${ko.seriesDescription}`);
      console.log(`      Key images referenced: ${ko.keyImageCount}`);
      console.log();
    }
  }

  // Presentation State
  console.log(`\n🎨 PRESENTATION STATE (PR): ${results.pr.length} files found`);
  if (results.pr.length > 0) {
    console.log('   These contain saved viewing settings and annotations.\n');
    for (const pr of results.pr) {
      const relativePath = path.relative(sampleDataPath, pr.path);
      console.log(`   📍 ${relativePath}`);
      console.log(`      Description: ${pr.seriesDescription}`);
      console.log(`      Has annotations: ${pr.hasAnnotations ? `Yes (${pr.annotationCount})` : 'No'}`);
      console.log(`      Has VOI LUT (window/level): ${pr.hasVoiLut ? 'Yes' : 'No'}`);
      console.log();
    }
  }

  // Graphic Overlays
  console.log(`\n🖼️  IMAGES WITH GRAPHIC OVERLAYS: ${results.overlays.length} files found`);
  if (results.overlays.length > 0) {
    console.log('   These have embedded bitmap overlays (ROI, text, graphics).\n');
    for (const ov of results.overlays) {
      const relativePath = path.relative(sampleDataPath, ov.path);
      console.log(`   📍 ${relativePath}`);
      console.log(`      Description: ${ov.seriesDescription}`);
      console.log(`      Overlay planes: ${ov.overlayGroups.map(g => `${g.group} (${g.rows}x${g.columns}, ${g.type === 'R' ? 'ROI' : 'Graphics'})`).join(', ')}`);
      console.log();
    }
  }

  // Summary
  console.log('━'.repeat(80));
  console.log('\n📊 SUMMARY\n');
  console.log(`   Total files analyzed: ${files.length}`);
  console.log(`   ├── Regular images: ${results.images.length}`);
  console.log(`   ├── Structured Reports (SR): ${results.sr.length}`);
  console.log(`   ├── Key Object Selection (KO): ${results.ko.length}`);
  console.log(`   ├── Presentation State (PR): ${results.pr.length}`);
  console.log(`   ├── Images with Overlays: ${results.overlays.length}`);
  console.log(`   └── Parse errors: ${results.errors.length}`);
  console.log();

  // Testing recommendations
  console.log('━'.repeat(80));
  console.log('\n🧪 TESTING RECOMMENDATIONS\n');

  if (results.sr.length > 0) {
    console.log('   ✅ SR Files: Load the study and check the Report Panel appears at the bottom.');
    console.log('      Look for expandable findings with measurements and nested content.');
    console.log();
  } else {
    console.log('   ⚠️  No SR files found. To test Structured Reports, you need sample SR DICOM files.');
    console.log();
  }

  if (results.ko.length > 0) {
    console.log('   ✅ KO Files: Load the study and look for star icons (⭐) in the Navigator sidebar.');
    console.log('      Key images should show a star badge in the viewport when viewing them.');
    console.log();
  } else {
    console.log('   ⚠️  No KO files found. To test Key Object Selection, you need sample KO DICOM files.');
    console.log();
  }

  if (results.pr.length > 0) {
    console.log('   ✅ PR Files: Load the study and check for vector annotations (circles, lines, text)');
    console.log('      rendered as an SVG overlay on the referenced images.');
    console.log();
  } else {
    console.log('   ⚠️  No PR files found. To test Presentation State, you need sample PR DICOM files.');
    console.log();
  }

  if (results.overlays.length > 0) {
    console.log('   ✅ Overlays: Load images with overlays and look for semi-transparent colored regions');
    console.log('      (yellow for graphics, green for ROI) rendered on top of the image.');
    console.log();
  } else {
    console.log('   ⚠️  No overlay images found. To test Graphic Overlays, you need DICOM images with 60xx group data.');
    console.log();
  }

  if (results.errors.length > 0) {
    console.log('\n⚠️  PARSE ERRORS:\n');
    for (const err of results.errors.slice(0, 5)) {
      const relativePath = path.relative(sampleDataPath, err.path);
      console.log(`   ${relativePath}: ${err.error}`);
    }
    if (results.errors.length > 5) {
      console.log(`   ... and ${results.errors.length - 5} more errors`);
    }
  }

  console.log('\n' + '━'.repeat(80) + '\n');
}

main();
