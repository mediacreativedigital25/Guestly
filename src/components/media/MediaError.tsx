import React from 'react';
import { AlertCircle } from 'lucide-react';

interface MediaErrorProps {
  message: string;
}

export const MediaError: React.FC<MediaErrorProps> = ({ message }) => {
  if (!message) return null;
  
  return (
    <div className="flex items-start gap-2 p-3 mt-2 bg-red-50 border border-red-100 rounded-md text-red-700 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  );
};
