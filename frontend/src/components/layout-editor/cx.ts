/** 极简 className 拼接（项目无 clsx 依赖，不引新包） */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
