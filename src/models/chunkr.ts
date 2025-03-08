import { ModelProvider } from './base';
import fs from 'fs';
import path from 'path';

// https://www.chunkr.ai/#pricing
const COST_PER_PAGE = 0.005;

export class ChunkrProvider extends ModelProvider {
  private endpoint: string;
  private apiKey: string;

  constructor() {
    super('chunkr');

    this.endpoint = process.env.CHUNKR_URL || 'https://api.chunkr.ai';
    this.apiKey = process.env.CHUNKR_API_KEY;

    if (!this.endpoint || !this.apiKey) {
      throw new Error('Missing required Chunkr configuration');
    }
  }

  private async createTask(imagePath: string): Promise<string> {
    // Remove data:image/png;base64, prefix if present
    const cleanedImagePath = imagePath.replace(/^data:image\/png;base64,/, '');

    const options = {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: cleanedImagePath,
        file_name: "image.png",
        ocr_strategy: 'All',
        high_resolution: true,
        chunk_processing: {
          ignore_headers_and_footers: false,
          target_length: 0,
        },
        segment_processing: {
          Picture: {
            markdown: "LLM",
          },
          Page: {
            markdown: "LLM",
          }
        },
      })
    };

    const response = await fetch(`${this.endpoint}/api/v1/task/parse`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to create Chunkr task: ${data.message || response.statusText}`);
    }

    return data.task_id;
  }

  private async pollTaskStatus(taskId: string): Promise<any> {
    const options = {
      method: 'GET',
      headers: { Authorization: this.apiKey }
    };

    while (true) {
      const response = await fetch(`${this.endpoint}/api/v1/task/${taskId}`, options);
      const data = await response.json();

      if (!response.ok) {
        console.error(`Failed to poll Chunkr task: ${data.message || response.statusText}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        switch (data.status) {
          case 'Succeeded':
            return data;
          case 'Failed':
          case 'Cancelled':
            throw new Error(`Chunkr task failed: ${data.message}`);
          case 'Starting':
          case 'Processing':
            await new Promise(resolve => setTimeout(resolve, 500));
            break;
          default:
            throw new Error(`Unknown task status: ${data.status}`);
        }
      }
    }
  }

  private getMarkdown(data: any) {
    if (!data || !data.output) throw new Error('Invalid Chunkr data');

    if (data.output.chunks) {
      const parts = [];

      for (const chunk of data.output.chunks) {
        let chunkMarkdown = "";

        if (chunk.segments) {
          for (const segment of chunk.segments) {
            if (segment.markdown) {
              chunkMarkdown += segment.markdown;
            }
          }
        }

        if (chunkMarkdown) {
          parts.push(chunkMarkdown);
        }
      }

      return parts.join("\n\n");
    }

    throw new Error('No chunks found in Chunkr output');
  }

  private getHTML(data: any) {
    if (!data || !data.output) throw new Error('Invalid Chunkr data');

    if (data.output.chunks) {
      const parts = [];

      for (const chunk of data.output.chunks) {
        let chunkHTML = "";

        if (chunk.segments) {
          for (const segment of chunk.segments) {
            if (segment.html) {
              chunkHTML += segment.html;
            }
          }
        }

        if (chunkHTML) {
          parts.push(chunkHTML);
        }
      }

      return parts.join("\n\n");
    }

    throw new Error('No chunks found in Chunkr output');
  }

  async ocr(imagePath: string) {
    let success = true;
    try {
      const start = performance.now();
      let text = '';

      try {
        // Create task and get task ID
        const taskId = await this.createTask(imagePath);

        // Poll until task completes
        const output = await this.pollTaskStatus(taskId);

        // Extract text from output
        text = this.getMarkdown(output);
        // text = this.getHTML(output);
      } catch (error) {
        console.error('Chunkr Error:', error);
        if (error instanceof Error && error.message.includes('task failed')) {
          success = false;
        }
      }

      const end = performance.now();

      return {
        text,
        usage: {
          duration: end - start,
          totalCost: success ? COST_PER_PAGE : 0, // the input is always 1 page. Chunkr doesn't charge for failed tasks.
        },
      };
    } catch (error) {
      console.error('Chunkr Error:', error);
      throw error;
    }
  }
}
