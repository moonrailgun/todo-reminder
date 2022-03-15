import { FeishuReminder } from 'todo-reminder-feishu';

new FeishuReminder(
  String(process.env.LARK_APP_ID),
  String(process.env.LARK_APP_SECRET)
).sendReminderRecordIntoBitable('./demo/**', {
  appToken: 'xxxxxxxxxxxxxx',
  tableId: 'xxxxxxxxxxxxxx',
});
