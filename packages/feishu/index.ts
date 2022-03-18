import {
  CheckSourceCodeOptions,
  checkSourceCodeTodo,
  TodoBlameInfo,
} from 'todo-reminder-core';
import ms from 'ms';
import axios from 'axios';
import chunk from 'lodash/chunk';

interface SendMsgPayload {
  tenantToken?: string;
  msgType?: 'text';
  chatId?: string;
  openId?: string;
  userId?: string;
  email?: string;
  content: string;
}

interface BitableItems {
  id: string;
  record_id: string;
  fields: {
    [key: string]: unknown;
  };
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

export interface SendReminderRecordIntoBitableOptions
  extends CheckSourceCodeOptions {
  /**
   * @link https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN
   * @example bascnCMII2ORej2RItqpZZUNMIe
   */
  appToken: string;

  /**
   * @link https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN
   * @example tblxI2tWaxP5dG7p
   */
  tableId: string;

  /**
   * Custom Table Fields
   * @default
   * {
   * [pathFieldName]: `${todo.filename}:${todo.line}`,
   * [authorFieldName]: `${todo.author} <${todo.authorMail}>`,
   * [createdFieldName]: new Date(todo.authorTime).valueOf(),
   * [gitSummaryFieldName]: todo.summary,
   * [sourceCodeFieldName]: todo.sourceCode,
   * }
   */
  customTableFields?: (todo: TodoBlameInfo) => Record<string, any>;

  /**
   * Field which todo file path
   * @default 'Filepath'
   */
  pathFieldName?: string;

  /**
   * Field which todo author
   * @default 'Author'
   */
  authorFieldName?: string;

  /**
   * Field which todo assignee
   * @default 'Created'
   */
  createdFieldName?: string;

  /**
   * Field which todo git summary
   * @default 'Summary'
   */
  gitSummaryFieldName?: string;

  /**
   * Field which todo source code
   * @default 'SourceCode'
   */
  sourceCodeFieldName?: string;
}

export class FeishuReminder {
  constructor(public appId: string, public appSecret: string) {}

  /**
   * Send Reminder Message to person
   */
  public async sendReminderMessage(
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

  /**
   * Send Reminder to Feishu Bitable
   *
   * Make sure your table have editable permission
   */
  public async sendReminderRecordIntoBitable(
    pattern: string,
    options: SendReminderRecordIntoBitableOptions
  ) {
    const {
      customTableFields,
      pathFieldName = 'Filepath',
      authorFieldName = 'Author',
      createdFieldName = 'Created',
      gitSummaryFieldName = 'Summary',
      sourceCodeFieldName = 'SourceCode',
    } = options;
    const todos = await checkSourceCodeTodo(pattern);

    const existedRecords = await this.fetchBitableRecords(
      options.appToken,
      options.tableId,
      {
        field_names: JSON.stringify([pathFieldName]),
      }
    );
    const existedFilepath = existedRecords.map(
      (r) => r.fields[pathFieldName] as string
    );
    const uninsertTodos = todos.filter(
      (todo) => !existedFilepath.includes(`${todo.filename}:${todo.line}`)
    );

    if (uninsertTodos.length === 0) {
      console.log('No more new TODOs');
      return;
    }

    const newRecords = uninsertTodos.map((todo) => ({
      fields: customTableFields
        ? customTableFields(todo) // Allow to Custom
        : {
            [pathFieldName]: `${todo.filename}:${todo.line}`,
            [authorFieldName]: `${todo.author} <${todo.authorMail}>`,
            [createdFieldName]: new Date(todo.authorTime).valueOf(),
            [gitSummaryFieldName]: todo.summary,
            [sourceCodeFieldName]: todo.sourceCode,
          },
    }));

    const res = await this.batchInsertBitableRecords(
      options.appToken,
      options.tableId,
      newRecords
    );

    console.debug('Result List:', res);
    console.log(
      `Insert ${newRecords.length} records into bitable: https://bytedance.feishu.cn/base/${options.appToken}?table=${options.tableId}.`
    );
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
   * @link https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/list
   */
  private async fetchBitableRecords(
    appToken: string,
    tableId: string,
    options: {
      field_names: string;
    }
  ): Promise<BitableItems[]> {
    const tenantToken = await this.getTenantToken();

    async function query(pageToken?: string): Promise<{
      has_more: boolean;
      page_token: string;
      total: number;
      items: BitableItems[];
    }> {
      const res = await axios({
        method: 'get',
        url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
        headers: {
          Authorization: `Bearer ${tenantToken}`,
        },
        params: { ...options, page_size: 2, page_token: pageToken },
      });

      return res.data?.data;
    }

    const items: BitableItems[] = [];
    async function loop(pageToken?: string) {
      const res = await query(pageToken);
      items.push(...(res.items ?? []));

      if (res.has_more) {
        await loop(res.page_token);
      }
    }
    await loop();

    return items;
  }

  /**
   * @link https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/batch_create
   */
  private async batchInsertBitableRecords(
    appToken: string,
    tableId: string,
    records: {
      fields: { [key: string]: any };
    }[]
  ) {
    const tenantToken = await this.getTenantToken();

    // Because of bitable's limits
    // will split by 100 record
    const resList = [];
    for (const c of chunk(records, 100)) {
      const _r = await axios({
        method: 'post',
        url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create?user_id_type=open_id`,
        headers: {
          Authorization: `Bearer ${tenantToken}`,
        },
        data: {
          records: c,
        },
      });

      resList.push(_r);
    }

    return resList;
  }

  /**
   * @link https://open.feishu.cn/document/ukTMukTMukTM/uUjNz4SN2MjL1YzM
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
