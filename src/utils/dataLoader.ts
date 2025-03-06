import { Input } from '../types';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Pull JSON files from local folder
export const loadLocalData = (folder: string): Input[] => {
  const files = fs.readdirSync(folder).filter((file) => file.endsWith('.jsonl'));
  const data = files.map((file) => {
    const filePath = path.join(folder, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonLines = fileContent.split('\n').filter(line => line.trim() !== '');

    const output = jsonLines.map((line) => {
      const jsonData = JSON.parse(line);

      // Read the image file and convert it to Base64
      const imagePath = path.join(folder, jsonData.file_name);
      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');

      return {
        imageUrl: `data:image/png;base64,${imageBase64}`,
        metadata: JSON.parse(jsonData.metadata),
        jsonSchema: JSON.parse(jsonData.json_schema),
        trueJsonOutput: JSON.parse(jsonData.true_json_output),
        trueMarkdownOutput: jsonData.true_markdown_output,
      };
    });

    return output;
  });

  return data.flat().slice(0, 10);
};

// Query results from the documents table.
export const loadFromDb = async (): Promise<Input[]> => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query(`
      SELECT
        url AS "imageUrl",
        config AS "metadata",
        schema AS "jsonSchema",
        extracted_json AS "trueJsonOutput",
        markdown AS "trueMarkdownOutput"
      FROM documents
      WHERE include_in_training = FALSE
      ORDER BY RANDOM()
      LIMIT 100;
    `);

    return result.rows as Input[];
  } catch (error) {
    console.error('Error querying data from PostgreSQL:', error);
    throw error;
  } finally {
    await pool.end();
  }
};
