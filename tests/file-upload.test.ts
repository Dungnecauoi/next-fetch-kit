// ============================================================================
// next-fetch-kit — Dynamic File Upload Tests
// Tests images, videos, docs (pdf, docx), excel (xlsx), FormData, direct Blob/File,
// and auto-FormData object conversion.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { server } from './setup';
import { http, HttpResponse } from 'msw';
import { createFetchKit } from '../src/client';

describe('dynamic file & media upload', () => {
  const api = createFetchKit({ baseURL: 'https://api.test.com' });

  describe('1. Direct File / Blob upload (dynamic MIME type)', () => {
    it('automatically sets Content-Type to image/png when posting a PNG File directly', async () => {
      let capturedContentType = '';
      server.use(
        http.post('https://api.test.com/upload-direct', async ({ request }) => {
          capturedContentType = request.headers.get('content-type') || '';
          return HttpResponse.json({ ok: true });
        }),
      );

      const file = new File(['fake-png-binary'], 'avatar.png', { type: 'image/png' });
      await api.post('/upload-direct', { body: file });
      expect(capturedContentType).toBe('image/png');
    });

    it('automatically sets Content-Type to video/mp4 when posting a Video File directly', async () => {
      let capturedContentType = '';
      server.use(
        http.post('https://api.test.com/upload-video', async ({ request }) => {
          capturedContentType = request.headers.get('content-type') || '';
          return HttpResponse.json({ ok: true });
        }),
      );

      const videoFile = new File(['fake-mp4-data'], 'promo.mp4', { type: 'video/mp4' });
      await api.post('/upload-video', { body: videoFile });
      expect(capturedContentType).toBe('video/mp4');
    });

    it('automatically sets Content-Type to Excel spreadsheet MIME when posting .xlsx directly', async () => {
      let capturedContentType = '';
      server.use(
        http.post('https://api.test.com/upload-excel', async ({ request }) => {
          capturedContentType = request.headers.get('content-type') || '';
          return HttpResponse.json({ ok: true });
        }),
      );

      const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const excelFile = new File(['fake-excel-data'], 'report.xlsx', { type: excelMime });
      await api.post('/upload-excel', { body: excelFile });
      expect(capturedContentType).toBe(excelMime);
    });

    it('automatically sets Content-Type to PDF when posting .pdf File directly', async () => {
      let capturedContentType = '';
      server.use(
        http.post('https://api.test.com/upload-pdf', async ({ request }) => {
          capturedContentType = request.headers.get('content-type') || '';
          return HttpResponse.json({ ok: true });
        }),
      );

      const pdfFile = new File(['fake-pdf-data'], 'document.pdf', { type: 'application/pdf' });
      await api.post('/upload-pdf', { body: pdfFile });
      expect(capturedContentType).toBe('application/pdf');
    });
  });

  describe('2. FormData upload (multi-part with dynamic boundary & file metadata)', () => {
    it('sends FormData containing image, excel, and text fields correctly', async () => {
      let capturedContentType = '';
      server.use(
        http.post('https://api.test.com/upload-formdata', async ({ request }) => {
          capturedContentType = request.headers.get('content-type') || '';
          const formData = await request.formData();
          const avatar = formData.get('avatar') as File;
          const excel = formData.get('excel') as File;
          const title = formData.get('title');

          return HttpResponse.json({
            avatarName: avatar.name,
            avatarType: avatar.type,
            excelName: excel.name,
            excelType: excel.type,
            title,
          });
        }),
      );

      const formData = new FormData();
      formData.append('avatar', new File(['img'], 'photo.jpg', { type: 'image/jpeg' }));
      formData.append(
        'excel',
        new File(['xls'], 'data.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      formData.append('title', 'Monthly Report');

      const { data } = await api.post<any>('/upload-formdata', { body: formData });
      // Content-Type should be multipart/form-data with boundary (not plain json)
      expect(capturedContentType).toContain('multipart/form-data');
      expect(data.avatarName).toBe('photo.jpg');
      expect(data.avatarType).toBe('image/jpeg');
      expect(data.excelName).toBe('data.xlsx');
      expect(data.excelType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(data.title).toBe('Monthly Report');
    });
  });

  describe('3. Smart Auto-FormData Conversion (Plain JS Object containing File/Blob)', () => {
    it('automatically converts object { avatar: File, doc: File, title: string } into FormData', async () => {
      let capturedContentType = '';
      server.use(
        http.post('https://api.test.com/upload-auto-form', async ({ request }) => {
          capturedContentType = request.headers.get('content-type') || '';
          const formData = await request.formData();
          const avatar = formData.get('avatar') as File;
          const doc = formData.get('doc') as File;
          const author = formData.get('author');

          return HttpResponse.json({
            avatarType: avatar.type,
            docType: doc.type,
            author,
          });
        }),
      );

      const payload = {
        avatar: new File(['png'], 'user.png', { type: 'image/png' }),
        doc: new File(['docx'], 'spec.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        author: 'Nguyen Van A',
      };

      const { data } = await api.post<any>('/upload-auto-form', { body: payload });
      expect(capturedContentType).toContain('multipart/form-data');
      expect(data.avatarType).toBe('image/png');
      expect(data.docType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(data.author).toBe('Nguyen Van A');
    });

    it('handles arrays of Files inside plain objects auto-FormData conversion', async () => {
      server.use(
        http.post('https://api.test.com/upload-array-files', async ({ request }) => {
          const formData = await request.formData();
          const photos = formData.getAll('photos') as File[];
          return HttpResponse.json({
            count: photos.length,
            types: photos.map((p) => p.type),
          });
        }),
      );

      const payload = {
        photos: [
          new File(['1'], 'img1.png', { type: 'image/png' }),
          new File(['2'], 'img2.jpg', { type: 'image/jpeg' }),
        ],
        albumName: 'Vacation',
      };

      const { data } = await api.post<any>('/upload-array-files', { body: payload });
      expect(data.count).toBe(2);
      expect(data.types).toEqual(['image/png', 'image/jpeg']);
    });

    it('handles nested objects and primitive array items in auto-FormData conversion', async () => {
      server.use(
        http.post('https://api.test.com/upload-nested-auto-form', async ({ request }) => {
          const formData = await request.formData();
          return HttpResponse.json({
            tags: formData.getAll('tags'),
            meta: JSON.parse(formData.get('meta') as string),
          });
        }),
      );

      const payload = {
        file: new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
        tags: ['tag1', 'tag2'],
        meta: { priority: 'high' },
      };

      const { data } = await api.post<any>('/upload-nested-auto-form', { body: payload });
      expect(data.tags).toEqual(['tag1', 'tag2']);
      expect(data.meta).toEqual({ priority: 'high' });
    });
  });
});
