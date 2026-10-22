let _counter = 0;
export function v4(): string {
  _counter++;
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${_counter}`;
}
