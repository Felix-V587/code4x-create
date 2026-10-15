/** Production `Prompter` backed by @clack/prompts. */

import * as p from "@clack/prompts";

import { CancelledError, type Prompter } from "../domain/flow.ts";

export function createClackPrompter(): Prompter {
  return {
    intro: (message) => p.intro(message),
    outro: (message) => p.outro(message),
    info: (message) => p.log.info(message),
    note: (message, title) => p.note(message, title),
    async text(options) {
      const value = await p.text({
        message: options.message,
        placeholder: options.placeholder,
        defaultValue: options.defaultValue,
      });
      if (p.isCancel(value)) throw new CancelledError();
      return value;
    },
    async select(options) {
      const value = await p.select<string>({
        message: options.message,
        options: options.options,
        initialValue: options.initialValue,
      });
      if (p.isCancel(value)) throw new CancelledError();
      return value;
    },
    async multiselect(options) {
      const value = await p.multiselect<string>({
        message: options.message,
        options: options.options,
        initialValues: options.initialValues,
        required: options.required ?? false,
      });
      if (p.isCancel(value)) throw new CancelledError();
      return value;
    },
    async confirm(options) {
      const value = await p.confirm({
        message: options.message,
        initialValue: options.initialValue,
      });
      if (p.isCancel(value)) throw new CancelledError();
      return value;
    },
  };
}
