import { checkSourceCodeTodo } from 'todo-reminder-core';

function start() {
  checkSourceCodeTodo('./demo/**').then((todoBlame) =>
    console.log({ todoBlame })
  );
}

start();
