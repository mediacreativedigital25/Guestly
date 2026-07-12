const fs = require('fs');
let code = fs.readFileSync('src/pages/EventDetails.tsx', 'utf8');

const startIndex = code.indexOf('<div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">');
const endIndex = code.indexOf('</nav>\n                </div>\n              </div>\n            </div>');
const blockLength = '</nav>\n                </div>\n              </div>\n            </div>'.length;

if (startIndex !== -1 && endIndex !== -1) {
  const newControls = `<div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                {hasMoreGuests && (
                  <button
                    onClick={handleLoadMoreGuests}
                    disabled={loadingMoreGuests}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 w-full justify-center"
                  >
                    {loadingMoreGuests ? 'Memuat...' : 'Muat Lebih Banyak'}
                  </button>
                )}
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Total data dimuat: <span className="font-medium">{filteredGuests.length}</span>
                  </p>
                </div>
                <div>
                  {hasMoreGuests && (
                    <button
                      onClick={handleLoadMoreGuests}
                      disabled={loadingMoreGuests}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {loadingMoreGuests ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  )}
                </div>
              </div>
            </div>`;

  code = code.substring(0, startIndex) + newControls + code.substring(endIndex + blockLength);
  fs.writeFileSync('src/pages/EventDetails.tsx', code);
  console.log("Replaced pagination controls successfully");
} else {
  console.log("Could not find start or end index");
}
