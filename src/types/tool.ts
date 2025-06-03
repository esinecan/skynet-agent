export interface MCPTool {
  name: string
  mcpToolName: string
  description: string
  parameters: any
  execute: (args: any) => Promise<any>
}