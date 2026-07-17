import React from 'react';

interface SSFLogoProps {
  className?: string;
  showText?: boolean;
}

export default function SSFLogo({ className = 'h-10 w-10', showText = true }: SSFLogoProps) {
  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`}>
      <img 
        src="https://i.pinimg.com/736x/db/ce/0f/dbce0ffa11c023edfc378a85a0259145.jpg" 
        alt="SSF Kerala Logo" 
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain rounded-xl"
      />
    </div>
  );
}
