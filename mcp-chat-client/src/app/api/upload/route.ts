import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - generous limit for multimodal content

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }    if (files.length > 20) { // More generous file count
      return NextResponse.json(
        { error: 'Maximum 20 files allowed per upload' },
        { status: 400 }
      );
    }

    const processedFiles = [];
      for (const file of files) {
      // Only validate file size - let the AI handle the rest
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds maximum size of 50MB` },
          { status: 400 }
        );
      }

      // Convert to base64 - no type validation
      const buffer = await file.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      processedFiles.push({
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64Data,
        uploadedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      files: processedFiles,
      message: `Successfully processed ${processedFiles.length} file(s)`,
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { 
        error: 'File upload failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Get upload info
export async function GET() {
  return NextResponse.json({
    maxFileSize: MAX_FILE_SIZE,
    maxFiles: 20,
    message: "Upload any file type - let the AI model decide what it can handle! 🚀",
    supportedByModels: {
      "Gemini": ["Images", "Text", "Audio", "Video", "Documents"],
      "GPT-4V": ["Images", "Text", "Documents"],
      "Claude": ["Images", "Text", "Documents"],
      "Note": "Different models have different capabilities - we don't restrict file types"
    },
  });
}
