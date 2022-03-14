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

## How to get userId?

- Quick click `Settings -> About -> Title` **5** times.
- Then you can see append more detail below
- Switch to chat page and open user profile card with click user avatar.
- Right click avatar in profile card and then you can click `Copy User Id` button.
