#!/bin/bash
cat src/types.ts | sed -e 's/export interface EventRecord {/export interface EventRecord {\n  souvenirTypes?: string[];\n  invitationUrl?: string;/g' > src/types_new.ts
echo -e "\nexport type AppUser = User;\nexport type PackageTier = 'trial' | 'basic' | 'premium' | 'enterprise';\nexport interface GuestbookEntry {\n  id?: string;\n  name: string;\n  message: string;\n  attendance: 'hadir' | 'tidak_hadir' | 'ragu_ragu';\n  reply?: string;\n  timestamp: any;\n}" >> src/types_new.ts
mv src/types_new.ts src/types.ts
