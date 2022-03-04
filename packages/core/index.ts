import { blameLine } from 'git-blame-line';
import globby from 'globby';
import fs from 'fs';
import flatten from 'lodash/flatten';

export interface CheckSourceCodeOptions {
  /**
   * @default 'TODO'
   */
  todoMark?: string;
}

export interface TodoBlameInfo {
  author: string;
  authorMail: string;
  authorTime: Date;
  authorTz: string;
  committer: string;
  committerMail: string;
  committerTime: Date;
  committerTz: string;
  summary: string;
  previous: string;
  filename: string;
  sourceCode: string;
  line: number;
}

/**
 * Check source code todo and return blame for those lines.
 *
 * @param pattern for example: "./src/**"
 * @param options
 * @returns
 */
export async function checkSourceCodeTodo(
  pattern: string,
  options?: CheckSourceCodeOptions
): Promise<TodoBlameInfo[]> {
  const { todoMark = 'TODO' } = options ?? {};

  const fileList = await globby(pattern, {
    onlyFiles: true,
  });
  const todos = await Promise.all(
    fileList.map(
      (fp) =>
        new Promise<{
          path: string;
          lines: number[];
        }>((resolve, reject) => {
          fs.readFile(fp, (err, data) => {
            if (err) {
              reject(err);
              return;
            }

            resolve({
              path: fp,
              lines: data
                .toString('utf-8')
                .split('\n')
                .map((line, i) => {
                  return line.includes(todoMark) ? i + 1 : false;
                })
                .filter<number>(
                  (num): num is number => typeof num === 'number'
                ),
            });
          });
        })
    )
  );

  const todoBlames = await Promise.all(
    todos
      .filter((todo) => todo.lines.length > 0)
      .map((todo) =>
        Promise.all(
          todo.lines.map((line) =>
            blameLine(`${todo.path}:${line}`).then((blameInfo) => ({
              ...blameInfo,
              line,
            }))
          )
        )
      )
  );

  return flatten(todoBlames);
}
