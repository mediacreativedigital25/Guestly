import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { GuestlyService } from '../../types';
import { useAuth } from '../../AuthContext';
import { useNavigate } from 'react-router-dom';

export default function ServicesCatalog() {
  const [services, setServices] = useState<GuestlyService[]>([]);
  const [loading, setLoading] = useState(true);
  const { appUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const servicesRef = collection(db, 'services');
        const q = query(servicesRef, where('isActive', '==', true));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestlyService));
        
        let filteredData = data;
        if (appUser?.role === 'client') {
           filteredData = data.filter(s => s.targetRole === 'client' || s.targetRole === 'all');
        } else if (appUser?.role === 'partner') {
           filteredData = data.filter(s => s.targetRole === 'partner' || s.targetRole === 'all');
        }
        
        setServices(filteredData);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'services');
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, [appUser?.role]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Layanan Guestly</h1>
      </div>
      
      {loading ? (
        <div className="text-center py-12 text-gray-500">Memuat katalog...</div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500">
           Belum ada layanan yang tersedia untuk Anda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
             <div key={service.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col h-full hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                        service.type === 'package' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {service.type === 'package' ? 'Paket' : 'Add-on'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 pr-16">{service.name}</h3>
                <p className="mt-2 text-sm text-gray-500 flex-grow whitespace-pre-line">{service.description}</p>
                
                <div className="mt-6 pt-6 border-t border-gray-100">
                   <div className="flex flex-col gap-1 mb-4">
                     {service.normalPrice && service.normalPrice > service.price && (
                       <span className="text-gray-400 line-through text-sm">
                         Rp {service.normalPrice.toLocaleString('id-ID')}
                       </span>
                     )}
                     <span className="text-3xl font-extrabold tracking-tight text-gray-900">
                       Rp {service.price.toLocaleString('id-ID')}
                     </span>
                   </div>
                   
                   <ul className="space-y-2 mb-6 text-sm text-gray-600">
                     {service.activePeriodDays ? (
                       <li className="flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                         Masa aktif {service.activePeriodDays} hari
                       </li>
                     ) : (
                       <li className="flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                         Masa aktif selamanya
                       </li>
                     )}
                     {service.eventQuota ? (
                       <li className="flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                         Kuota {service.eventQuota} Acara
                       </li>
                     ) : null}
                     {service.guestQuota ? (
                       <li className="flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                         Kuota {service.guestQuota} Tamu
                       </li>
                     ) : null}
                   </ul>

                   <button 
                     onClick={() => navigate(`/services/checkout/${service.id}`)}
                     className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 transition"
                   >
                     Pilih Layanan
                   </button>
                </div>
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
