const fs = require('fs');

function replaceInFile(filePath, replacements) {
  let code = fs.readFileSync(filePath, 'utf8');
  replacements.forEach(([from, to]) => {
    code = code.split(from).join(to);
  });
  fs.writeFileSync(filePath, code);
}

replaceInFile('src/components/AdminPanel.tsx', [
  ["import { UserIcon as AppUser, Guest } from '../types';", "import { User as AppUser, Guest } from '../types';"],
  ["import { User as AppUser, Guest } from '../types';", "import { User as AppUser, Guest } from '../types';"],
  ["import { User as UserIcon } from 'lucide-react';", "import { User as UserIcon } from 'lucide-react';"],
  ["currentUserIcon", "currentUser"],
  ["(u: UserIcon)", "(u: AppUser)"],
  ["as UserIcon", "as AppUser"],
  ["(u: User)", "(u: AppUser)"],
  ["as User", "as AppUser"],
  ["<User ", "<UserIcon "],
  ["</User>", "</UserIcon>"],
]);
replaceInFile('src/components/ClientPanel.tsx', [
  ["import { UserIcon as AppUser, Guest } from '../types';", "import { User as AppUser, Guest } from '../types';"],
  ["import { User as AppUser, Guest } from '../types';", "import { User as AppUser, Guest } from '../types';"],
  ["import { User as UserIcon } from 'lucide-react';", "import { User as UserIcon } from 'lucide-react';"],
  ["currentUserIcon", "currentUser"],
  ["(u: UserIcon)", "(u: AppUser)"],
  ["as UserIcon", "as AppUser"],
  ["(u: User)", "(u: AppUser)"],
  ["as User", "as AppUser"],
  ["<User ", "<UserIcon "],
  ["</User>", "</UserIcon>"],
]);

