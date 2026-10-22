/**
 * Official Brand Logos for Compatible Engines & Cultural Stack
 * Configured with custom CSS dark-mode filters so all user-uploaded logos
 * blend onto dark grey surfaces (#141414) with high contrast.
 */

export interface BrandLogo {
  name: string;
  category: string;
  imageSrc?: string;
  svg?: string;
  filterClass?: 'filter-invert' | 'filter-native' | 'filter-blend';
}

export const WORKFLOW_LOGOS: BrandLogo[] = [
  { name: 'Qloo Taste AI', category: 'Taste data source', imageSrc: '/logos/qloo.png', filterClass: 'filter-invert' },
  { name: 'Unity', category: 'C# importer export', imageSrc: '/logos/unity.png', filterClass: 'filter-invert' },
  { name: 'Godot', category: 'GDScript resource export', imageSrc: '/logos/godot.png', filterClass: 'filter-invert' },
  { name: 'Unreal Engine', category: 'JSON → DataTable struct', imageSrc: '/logos/unreal.png', filterClass: 'filter-invert' },
  { name: 'Steam Store', category: 'Reference game lookup', imageSrc: '/logos/steamworks.png', filterClass: 'filter-invert' },
];
