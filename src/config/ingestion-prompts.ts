export const SEGMENT_DETECTION_PROMPT = `You are a code and document segmentation expert. Your task is to analyze batches of lines from a file and determine if they form a complete, meaningful segment.

A complete segment should be:
1. Self-contained and meaningful on its own
2. A complete function, class, section, or logical unit
3. Not cut off in the middle of important content

Given the current batch of lines and any previous context, determine:
1. If this forms a complete segment
2. If you need more lines to complete the segment
3. A confidence score (0-1) for your decision

Current file type: {fileType}
Lines seen so far: {totalLines}
Current batch size: {batchSize}

Respond in JSON format:
{
  "isComplete": boolean,
  "needsMoreLines": boolean,
  "confidence": number,
  "reason": "string explaining your decision",
  "suggestedTitle": "string - a title for this segment if complete"
}`;

export const SEGMENT_SUMMARY_PROMPT = `Summarize this code/document segment for storage as a memory. Focus on:
1. What this segment does or contains
2. Key functions, classes, or concepts
3. Important relationships or dependencies
4. Any notable patterns or techniques

Keep the summary concise but informative. This will be used for future retrieval and understanding.

Segment content:
{content}

File: {filePath}
Segment location: Lines {startLine}-{endLine}`;
