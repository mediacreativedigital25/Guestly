/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { EventDetails } from '../types';
import { getExpirationDate, isEventExpired } from '../lib/utils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface EventHeaderProps {
  event: EventDetails;
}

export default function EventHeader({ event }: EventHeaderProps) {
  const expirationDate = getExpirationDate(event);
  const isExpired = isEventExpired(event);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center mb-12"
    >
      <h1 className="text-3xl md:text-5xl font-serif mb-6 tracking-tight">
        {event.title}
      </h1>
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-gray-600 font-sans">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-olive" />
          <span>{event.date}</span>
        </div>
        <div className="hidden md:block text-gray-300">|</div>
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-olive" />
          <span>{event.location}</span>
        </div>
        <div className="hidden md:block text-gray-300">|</div>
        <div className="flex items-center gap-2">
          <Clock className={`w-5 h-5 ${isExpired ? 'text-red-500' : 'text-olive'}`} />
          <span className={isExpired ? 'text-red-500 font-bold' : ''}>
            {isExpired ? 'Expired: ' : 'Aktif hingga: '}
            {format(expirationDate, 'dd MMMM yyyy', { locale: id })}
          </span>
        </div>
      </div>
      <div className="mt-8 mx-auto w-24 h-px bg-olive/30" />
    </motion.div>
  );
}
