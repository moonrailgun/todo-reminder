import { checkSourceCode } from 'todo-reminder-core';

function start() {
  checkSourceCode('./demo/**').then((todoBlame) => console.log({ todoBlame }));
}

start();
