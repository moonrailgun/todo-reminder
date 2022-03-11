import {
  CheckSourceCodeOptions,
  checkSourceCodeTodo,
  TodoBlameInfo,
} from 'todo-reminder-core';
import ms from 'ms';
import axios from 'axios';

interface SendMsgPayload {
  tenantToken?: string;
  msgType?: 'text';
  chatId?: string;
  openId?: string;
  userId?: string;
  email?: string;
  content: string;
}

function defaultReminderMessageRender(todos: TodoBlameInfo[]) {
  const todolistText = todos
    .map(
      (todo) =>
        `- ${todo.filename}:${todo.line}\n   > ${todo.sourceCode.trim()}`
    )
    .join('\n');

  return `You have those TODO not been resolve:\n\n${todolistText}`;
}

export interface SendReminderMessageOptions extends CheckSourceCodeOptions {
  /**
   * key: email
   * value: lark user id
   */
  userIdMap: Record<string, string>;

  /**
   * How to send reminder message
   *
   * @default
   * You have those TODO not been resolve:
   *
   * - packages/test/demo/bar.ts:2
   *   > // TODO: remove somthing
   * - packages/test/demo/bar.ts:3
   *   > // TODO: add somthing
   * - packages/test/demo/index.ts:2
   *   > // TODO: add code
   */
  reminderMessageRender?: (todos: TodoBlameInfo[]) => string;

  /**
   *
   * @example 1d, 1w or ms number
   * @default 0
   * @link https://github.com/vercel/ms
   */
  gracePeriodMs?: number | string;
}

export class FeishuReminder {
  constructor(public appId: string, public appSecret: string) {}

  async sendReminderMessage(
    pattern: string,
    options: SendReminderMessageOptions
  ): Promise<Record<string, TodoBlameInfo[]>> {
    const todos = await checkSourceCodeTodo(pattern);

    const todoGroup: Record<string, TodoBlameInfo[]> = {};

    const gracePeriodMs = ms(String(options.gracePeriodMs ?? 0));
    const now = new Date().valueOf();
    for (const todo of todos) {
      if (now - todo.authorTime.valueOf() < gracePeriodMs) {
        // in grace period
        continue;
      }

      if (!todoGroup[todo.authorMail]) {
        todoGroup[todo.authorMail] = [];
      }
      todoGroup[todo.authorMail].push(todo);
    }

    const userIdMap = options.userIdMap;
    const reminderMessageRender =
      options.reminderMessageRender ?? defaultReminderMessageRender;

    const promiseList = Object.entries(todoGroup).map(([mail, todos]) => {
      if (!userIdMap[mail]) {
        return;
      }

      return this.sendLarkMsg({
        userId: userIdMap[mail],
        content: reminderMessageRender(todos),
      });
    });

    await Promise.all(promiseList);

    return todoGroup;
  }

  private async getTenantToken() {
    const res = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',
      {
        app_id: this.appId,
        app_secret: this.appSecret,
      }
    );

    return res.data.tenant_access_token;
  }

  /**
   * https://open.feishu.cn/document/ukTMukTMukTM/uUjNz4SN2MjL1YzM
   */
  private async sendLarkMsg(payload: SendMsgPayload) {
    let tenantToken = payload.tenantToken;
    const msgType = payload.msgType ?? 'text';
    const contentKey = msgType;

    if (!tenantToken) {
      tenantToken = await this.getTenantToken();
    }

    const data = {
      chat_id: payload.chatId,
      open_id: payload.openId,
      user_id: payload.userId,
      email: payload.email,
      msg_type: msgType,
      content: {
        [contentKey]: payload.content,
      },
    };

    const res = await axios({
      method: 'post',
      url: 'https://open.feishu.cn/open-apis/message/v4/send',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
      },
      data,
    });

    return res;
  }
}
