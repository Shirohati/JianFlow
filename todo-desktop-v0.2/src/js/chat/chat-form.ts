interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'tags' | 'date';
  required?: boolean;
  options?: string[];
}

interface FormSchema {
  title?: string;
  fields: FormField[];
}

export function parseFormSchema(content: string): FormSchema | null {
  const match = content.match(/【FORM】([\s\S]*?)【\/FORM】/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

export function collectFormData(container: HTMLElement): Record<string, any> {
  const data: Record<string, any> = {};
  container.querySelectorAll('[data-form-key]').forEach(el => {
    const key = (el as HTMLElement).dataset.formKey!;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      data[key] = el.value;
    } else if (el.classList.contains('cf-tags-container')) {
      const tags = el.querySelectorAll('.cf-tag');
      data[key] = Array.from(tags).map(t => t.textContent || '');
    }
  });
  return data;
}

export function renderForm(schema: FormSchema): string {
  const fields = schema.fields.map(f => renderField(f)).join('');
  return `
    <div class="cf-form">
      ${schema.title ? `<div class="cf-form-title">${escapeHtml(schema.title)}</div>` : ''}
      <div class="cf-form-fields">${fields}</div>
      <div class="cf-actions">
        <button class="cf-btn-submit btn btn--primary">确认</button>
        <button class="cf-btn-cancel btn btn--ghost">修改</button>
      </div>
    </div>
  `;
}

function renderField(f: FormField): string {
  const required = f.required ? ' required' : '';
  const label = `<label class="cf-label">${f.required ? '<span class="cf-required">*</span>' : ''}${escapeHtml(f.label)}</label>`;

  switch (f.type) {
    case 'text':
      return `<div class="cf-field">${label}<input type="text" class="cf-input" data-form-key="${f.key}"${required}></div>`;
    case 'textarea':
      return `<div class="cf-field">${label}<textarea class="cf-textarea" data-form-key="${f.key}" rows="3"${required}></textarea></div>`;
    case 'number':
      return `<div class="cf-field">${label}<input type="number" class="cf-input" data-form-key="${f.key}"${required}></div>`;
    case 'select':
      const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      return `<div class="cf-field">${label}<select class="cf-select" data-form-key="${f.key}"${required}>${opts}</select></div>`;
    case 'tags':
      return `<div class="cf-field">${label}<div class="cf-tags-container" data-form-key="${f.key}"><input type="text" class="cf-tags-input" placeholder="输入后回车添加"><div class="cf-tags"></div></div></div>`;
    case 'date':
      return `<div class="cf-field">${label}<input type="date" class="cf-input" data-form-key="${f.key}"${required}></div>`;
    default:
      return '';
  }
}

function escapeHtml(str: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return str.replace(/[&<>"]/g, c => m[c] || c);
}

export function initTagsInput(container: HTMLElement): void {
  container.addEventListener('keydown', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.classList.contains('cf-tags-input')) return;
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      const tagsContainer = input.parentElement?.querySelector('.cf-tags');
      if (!tagsContainer) return;
      const tag = document.createElement('span');
      tag.className = 'cf-tag';
      tag.textContent = val;
      const del = document.createElement('span');
      del.className = 'cf-tag-del';
      del.textContent = '×';
      del.addEventListener('click', () => tag.remove());
      tag.appendChild(del);
      tagsContainer.appendChild(tag);
      input.value = '';
    }
  });
}
