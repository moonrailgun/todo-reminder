# Feishu Reminder Sender for TODO

## Usage

```js
new FeishuReminder(
  process.env.LARK_APP_ID,
  process.env.LARK_APP_SECRET
).sendReminderMessage({
  userIdMap: {
    "moonrailgun@gmail.com": "xxxxxxxxxxxxxxxx"
  },
  reminderMessageRender: (todos) => {
    const todolistText = todos
      .map(
        (todo) =>
          `- ${todo.filename}:${todo.line}\n   > ${todo.sourceCode.trim()}`
      )
      .join('\n');

    return `You have those TODO not been resolve:\n\n${todolistText}`;
  },
  gracePeriodMs: '1h',
});
```
