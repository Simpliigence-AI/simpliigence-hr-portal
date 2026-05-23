import { getAvatarColor } from '@/lib/utils';
import Image from 'next/image';

interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-11 h-11 text-sm', lg: 'w-16 h-16 text-lg' };

export default function Avatar({ name, photoUrl, size = 'md' }: AvatarProps) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const color    = getAvatarColor(name);
  const cls      = sizes[size];

  if (photoUrl) {
    return (
      <div className={`${cls} rounded-full overflow-hidden relative shrink-0`}>
        <Image src={photoUrl} alt={name} fill className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}
