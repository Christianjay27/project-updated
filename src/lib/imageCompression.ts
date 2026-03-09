export const compressImage = (file: File, maxSizeMB: number = 2): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onerror = () => reject(reader.error);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        let quality = 0.7;
        let scale = 1;

        const compressWithSettings = (currentQuality: number, currentScale: number): void => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width * currentScale;
          canvas.height = img.height * currentScale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Could not compress image'));
                return;
              }

              if (blob.size > maxSizeBytes) {
                if (currentQuality > 0.3) {
                  compressWithSettings(currentQuality - 0.15, currentScale);
                } else if (currentScale > 0.5) {
                  compressWithSettings(0.7, currentScale - 0.2);
                } else {
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                  });
                  resolve(compressedFile);
                }
              } else {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                });
                resolve(compressedFile);
              }
            },
            'image/jpeg',
            currentQuality
          );
        };

        compressWithSettings(quality, scale);
      };
    };
  });
};
