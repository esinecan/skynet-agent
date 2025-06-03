import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  // Microsoft Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  // Code files
  'text/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'application/javascript',
  'application/typescript',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    if (files.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 files allowed per upload' },
        { status: 400 }
      );
    }

    const processedFiles = [];
    
    for (const file of files) {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds maximum size of 10MB` },
          { status: 400 }
        );
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type "${file.type}" is not allowed for file "${file.name}"` },
          { status: 400 }
        );
      }

      // Convert to base64
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
    maxFiles: 10,
    allowedTypes: ALLOWED_TYPES,
    supportedFormats: {
      images: ['JPEG', 'PNG', 'GIF', 'WebP', 'SVG'],
      documents: ['PDF', 'TXT', 'MD', 'CSV', 'JSON', 'XML'],
      office: ['DOCX', 'XLSX', 'PPTX', 'DOC', 'XLS', 'PPT'],
      code: ['JS', 'TS', 'HTML', 'CSS'],
    },
  });
}
