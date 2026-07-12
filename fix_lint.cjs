const fs = require('fs');

function replaceInFile(filePath, replacements) {
  let code = fs.readFileSync(filePath, 'utf8');
  replacements.forEach(([from, to]) => {
    code = code.split(from).join(to);
  });
  fs.writeFileSync(filePath, code);
}

// In AdminPanel
replaceInFile('src/components/AdminPanel.tsx', [
  ["import { UserIcon, Guest } from '../types';", "import { User, Guest } from '../types';"],
  ["import { UserIcon } from 'lucide-react';", "import { User as UserIcon } from 'lucide-react';"],
  ["<UserIcon className", "<UserIcon className"], // this one is ok
  ["currentUserIcon", "currentUser"],
  ["UserIcon | null", "User | null"],
  ["(UserIcon)", "(User)"],
  ["as UserIcon", "as User"],
  ["users.map((user: UserIcon) =>", "users.map((user: User) =>"],
  ["(u: UserIcon)", "(u: User)"]
]);

// In ClientPanel
replaceInFile('src/components/ClientPanel.tsx', [
  ["import { UserIcon, Guest } from '../types';", "import { User, Guest } from '../types';"],
  ["import { UserIcon } from 'lucide-react';", "import { User as UserIcon } from 'lucide-react';"],
  ["currentUserIcon", "currentUser"],
  ["UserIcon | null", "User | null"],
  ["(UserIcon)", "(User)"],
  ["as UserIcon", "as User"]
]);

console.log("Fixed AdminPanel and ClientPanel");
