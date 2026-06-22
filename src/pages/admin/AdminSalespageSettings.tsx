import React from 'react';
import { UploadCloud, Plus, Trash2 } from 'lucide-react';

interface Props {
  data: any;
  updateData: (key: string, value: any) => void;
}

export default function AdminSalespageSettings({ data, updateData }: Props) {
  const addCarouselItem = () => {
    const current = data.featuresCarouselData || [];
    updateData('featuresCarouselData', [...current, { title: '', img: '' }]);
  };

  const updateCarouselItem = (index: number, key: string, value: string) => {
    const current = data.featuresCarouselData || [];
    const newItems = [...current];
    newItems[index] = { ...newItems[index], [key]: value };
    updateData('featuresCarouselData', newItems);
  };

  const removeCarouselItem = (index: number) => {
    const current = data.featuresCarouselData || [];
    const newItems = current.filter((_: any, i: number) => i !== index);
    updateData('featuresCarouselData', newItems);
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Hero Section</h3>
        <div className="space-y-4 border border-gray-200 rounded-lg p-5 bg-gray-50">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Utama (Title)</label>
            <textarea 
              value={data.heroTitle || ''} 
              onChange={e => updateData('heroTitle', e.target.value)} 
              placeholder="Buku Tamu Digital Modern untuk Acara yang Lebih Rapi & Profesional" 
              rows={3} 
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teks Highlight (Misal: Rapi & Profesional)</label>
            <input 
              type="text" 
              value={data.heroHighlight || ''} 
              onChange={e => updateData('heroHighlight', e.target.value)} 
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Pendek (Subtitle)</label>
            <textarea 
              value={data.heroSubtitle || ''} 
              onChange={e => updateData('heroSubtitle', e.target.value)} 
              placeholder="Kelola kehadiran tamu, check-in QR Code..." 
              rows={3} 
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" 
            />
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Statistik (Angka)</h3>
        <div className="space-y-4 border border-gray-200 rounded-lg p-5 bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stat 1 Label (cth: Event)</label>
              <input type="text" value={data.stat1Label || ''} onChange={e => updateData('stat1Label', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stat 1 Value (cth: 1.000+)</label>
              <input type="text" value={data.stat1Value || ''} onChange={e => updateData('stat1Value', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stat 2 Label</label>
              <input type="text" value={data.stat2Label || ''} onChange={e => updateData('stat2Label', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stat 2 Value</label>
              <input type="text" value={data.stat2Value || ''} onChange={e => updateData('stat2Value', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Features Carousel Config */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Fitur Kelola Acara (Carousel)</h3>
        <div className="space-y-4 border border-gray-200 rounded-lg p-5 bg-gray-50">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Utama</label>
            <input type="text" value={data.featuresCarouselTitle || ''} onChange={e => updateData('featuresCarouselTitle', e.target.value)} placeholder="Kelola Acara dengan Mudah" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white mb-4" />
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Utama</label>
            <textarea value={data.featuresCarouselDesc || ''} onChange={e => updateData('featuresCarouselDesc', e.target.value)} placeholder="Semua data tersaji rapi..." rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white mb-6" />
          </div>
          
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Daftar Carousel Image</label>
            {(data.featuresCarouselData || []).map((item: any, index: number) => (
              <div key={index} className="flex gap-3 items-start border border-gray-200 bg-white p-3 rounded-lg shadow-sm">
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Judul Fitur</label>
                    <input 
                      type="text" 
                      value={item.title} 
                      onChange={e => updateCarouselItem(index, 'title', e.target.value)}
                      placeholder="Dashboard Utama"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">URL Gambar</label>
                      <input 
                        type="text" 
                        value={item.img || ''} 
                        onChange={e => updateCarouselItem(index, 'img', e.target.value)}
                        placeholder="https://..."
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Link Tujuan (Opsional)</label>
                      <input 
                        type="text" 
                        value={item.link || ''} 
                        onChange={e => updateCarouselItem(index, 'link', e.target.value)}
                        placeholder="https://..."
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => removeCarouselItem(index)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                  title="Hapus"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button 
              onClick={addCarouselItem}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-2"
            >
              <Plus className="w-4 h-4" /> Tambah Item Carousel
            </button>
          </div>
        </div>
      </div>

      {/* Problem & Solution */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Masalah & Solusi</h3>
        <div className="space-y-4 border border-gray-200 rounded-lg p-5 bg-gray-50">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Masalah (Kiri)</label>
            <input type="text" value={data.problemTitle || ''} onChange={e => updateData('problemTitle', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gambar Masalah (URL)</label>
            <input type="text" value={data.problemImage || ''} onChange={e => updateData('problemImage', e.target.value)} placeholder="https://..." className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Poin Masalah (Satu poin per baris)</label>
            <textarea 
              value={data.problemItems || ''} 
              onChange={e => updateData('problemItems', e.target.value)} 
              placeholder="Tulisan sulit dibaca\nData tamu tercecer" 
              rows={4} 
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" 
            />
          </div>
          <div className="pt-4 border-t border-gray-200 mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Solusi (Kanan)</label>
            <input type="text" value={data.solutionTitle || ''} onChange={e => updateData('solutionTitle', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Solusi</label>
            <textarea 
              value={data.solutionDesc || ''} 
              onChange={e => updateData('solutionDesc', e.target.value)} 
              rows={3} 
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" 
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cara Kerja (4 Langkah)</h3>
        <div className="space-y-4 border border-gray-200 rounded-lg p-5 bg-gray-50">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Seksi Steps</label>
            <input type="text" value={data.stepsTitle || ''} onChange={e => updateData('stepsTitle', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white mb-4" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Step 1 - Judul</label>
              <input type="text" value={data.s1Title || ''} onChange={e => updateData('s1Title', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
              <label className="block text-sm font-medium text-gray-700 mt-2 mb-1">Step 1 - Deskripsi</label>
              <textarea value={data.s1Desc || ''} onChange={e => updateData('s1Desc', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Step 2 - Judul</label>
              <input type="text" value={data.s2Title || ''} onChange={e => updateData('s2Title', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
              <label className="block text-sm font-medium text-gray-700 mt-2 mb-1">Step 2 - Deskripsi</label>
              <textarea value={data.s2Desc || ''} onChange={e => updateData('s2Desc', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Step 3 - Judul</label>
              <input type="text" value={data.s3Title || ''} onChange={e => updateData('s3Title', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
              <label className="block text-sm font-medium text-gray-700 mt-2 mb-1">Step 3 - Deskripsi</label>
              <textarea value={data.s3Desc || ''} onChange={e => updateData('s3Desc', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Step 4 - Judul</label>
              <input type="text" value={data.s4Title || ''} onChange={e => updateData('s4Title', e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
              <label className="block text-sm font-medium text-gray-700 mt-2 mb-1">Step 4 - Deskripsi</label>
              <textarea value={data.s4Desc || ''} onChange={e => updateData('s4Desc', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
