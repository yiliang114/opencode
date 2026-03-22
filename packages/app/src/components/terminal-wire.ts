const attrs = /^(?:\u001b\[\?62;22c|\u001b\[>1;10;0c)+$/

export function forwardData(input: {
  data: string
  session?: string
  qwen?: string
}) {
  if (!input.session && !input.qwen) return input.data
  if (attrs.test(input.data)) return ""
  return input.data
}
