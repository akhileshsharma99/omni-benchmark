import fs from 'fs';
import path from 'path';

import { ExtractionResult } from '../types';

export const createResultFolder = (folderName: string) => {
  // check if results folder exists
  const resultsFolder = path.join(__dirname, '..', '..', 'results');
  if (!fs.existsSync(resultsFolder)) {
    fs.mkdirSync(resultsFolder, { recursive: true });
  }

  const folderPath = path.join(resultsFolder, folderName);
  fs.mkdirSync(folderPath, { recursive: true });
  return folderPath;
};

export const writeToFile = (filePath: string, content: any) => {
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
};

export const safeWriteToFile = (filePath: string, content: any) => {
  const errorLogPath = `${filePath}.errors.log`;
  const tempPath = `${filePath}.temp`;
  let successfulItems = [];

  try {
    fs.writeFileSync(tempPath, '[\n');

    for (let i = 0; i < content.length; i++) {
      try {
        const item = content[i];
        const itemJson = JSON.stringify(item, null, 2);

        const line = i === 0 ? itemJson : `,\n${itemJson}`;
        fs.appendFileSync(tempPath, line);

        successfulItems.push(item);
      } catch (err) {
        const errorMsg = `Error serializing item at index ${i}: ${err}\n`;
        fs.appendFileSync(errorLogPath, errorMsg);
      }
    }

    fs.appendFileSync(tempPath, '\n]');

    fs.renameSync(tempPath, filePath);

    console.log(`Successfully wrote ${successfulItems.length} of ${content.length} items to ${filePath}`);
    if (successfulItems.length < content.length) {
      console.log(`${content.length - successfulItems.length} items could not be serialized. See ${errorLogPath} for details.`);
    }
  } catch (error) {
    console.error(`Error writing to file ${filePath}:`, error);

    try {
      writeToFile(filePath, successfulItems);
      console.log(`Recovered by writing ${successfulItems.length} successful items to ${filePath}`);
    } catch (finalError) {
      console.error(`Failed to recover:`, finalError);
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

export const writeResultToFile = (
  outputDir: string,
  fileName: string,
  result: ExtractionResult,
) => {
  fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(result, null, 2));
};
