import React from 'react';

interface MediaProgressProps {
  progress?: number;
  label?: string;
}

export const MediaProgress: React.FC<MediaProgressProps> = ({ progress = 0, label = 'Mengunggah...' }) => {
  return (
    <div className="w-full mt-3">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        {progress > 0 && <span className="text-xs font-medium text-indigo-600">{progress}%</span>}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};
