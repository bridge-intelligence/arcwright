import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

export interface FileNode {
  filePath: string;
  relativePath: string;
  fileName: string;
  directory: string;
  size: number;
  imports: string[];        // resolved absolute paths
  exports: ExportInfo[];
  isEntryPoint: boolean;
}

export interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'default' | 'reexport';
  line: number;
}

export interface ImportEdge {
  source: string;   // absolute path of importing file
  target: string;   // absolute path of imported file
  specifiers: string[];  // named imports
  importType: 'named' | 'default' | 'namespace' | 'side-effect' | 'dynamic';
}

export interface AnalysisResult {
  files: FileNode[];
  edges: ImportEdge[];
  entryPoints: string[];
  totalFiles: number;
  analyzedFiles: number;
  duration: number;
}

export class WorkspaceAnalyzer {
  async analyze(
    rootPath: string,
    excludePatterns: string[],
    maxFiles: number
  ): Promise<AnalysisResult> {
    const start = Date.now();

    // Find tsconfig.json
    const tsconfigPath = this._findTsConfig(rootPath);
    const compilerOptions = tsconfigPath
      ? this._loadCompilerOptions(tsconfigPath)
      : this._defaultCompilerOptions();

    // Discover source files
    const sourceFiles = this._discoverFiles(rootPath, excludePatterns, maxFiles);
    const entryPoints = this._detectEntryPoints(sourceFiles, rootPath);

    // Create program for type-aware resolution
    const program = ts.createProgram(sourceFiles, compilerOptions);
    const checker = program.getTypeChecker();

    const fileNodes: FileNode[] = [];
    const edges: ImportEdge[] = [];
    const sourceSet = new Set(sourceFiles);

    for (const filePath of sourceFiles) {
      const sourceFile = program.getSourceFile(filePath);
      if (!sourceFile) continue;

      const fileInfo: FileNode = {
        filePath,
        relativePath: path.relative(rootPath, filePath),
        fileName: path.basename(filePath),
        directory: path.relative(rootPath, path.dirname(filePath)),
        size: fs.statSync(filePath).size,
        imports: [],
        exports: [],
        isEntryPoint: entryPoints.includes(filePath),
      };

      // Walk AST for imports
      ts.forEachChild(sourceFile, (node) => {
        // Import declarations: import { x } from './y'
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          const resolved = this._resolveModule(specifier, filePath, compilerOptions, rootPath);

          if (resolved && sourceSet.has(resolved)) {
            fileInfo.imports.push(resolved);

            const importType = this._getImportType(node);
            const specifiers = this._getImportSpecifiers(node);

            edges.push({
              source: filePath,
              target: resolved,
              specifiers,
              importType,
            });
          }
        }

        // Dynamic imports: import('./x')
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            const resolved = this._resolveModule(arg.text, filePath, compilerOptions, rootPath);
            if (resolved && sourceSet.has(resolved)) {
              fileInfo.imports.push(resolved);
              edges.push({
                source: filePath,
                target: resolved,
                specifiers: [],
                importType: 'dynamic',
              });
            }
          }
        }

        // Re-exports: export { x } from './y', export * from './y'
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          const resolved = this._resolveModule(specifier, filePath, compilerOptions, rootPath);
          if (resolved && sourceSet.has(resolved)) {
            fileInfo.imports.push(resolved);
            edges.push({
              source: filePath,
              target: resolved,
              specifiers: [],
              importType: 'named',
            });
          }
        }

        // Collect exports
        this._collectExports(node, sourceFile, fileInfo.exports);
      });

      // Deduplicate imports
      fileInfo.imports = [...new Set(fileInfo.imports)];
      fileNodes.push(fileInfo);
    }

    return {
      files: fileNodes,
      edges,
      entryPoints,
      totalFiles: sourceFiles.length,
      analyzedFiles: fileNodes.length,
      duration: Date.now() - start,
    };
  }

  private _findTsConfig(rootPath: string): string | undefined {
    const candidates = ['tsconfig.json', 'tsconfig.app.json'];
    for (const name of candidates) {
      const p = path.join(rootPath, name);
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  }

  private _loadCompilerOptions(tsconfigPath: string): ts.CompilerOptions {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) return this._defaultCompilerOptions();

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(tsconfigPath)
    );
    return parsed.options;
  }

  private _defaultCompilerOptions(): ts.CompilerOptions {
    return {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
    };
  }

  private _discoverFiles(rootPath: string, excludePatterns: string[], maxFiles: number): string[] {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];

    const shouldExclude = (filePath: string): boolean => {
      const rel = path.relative(rootPath, filePath);
      return excludePatterns.some(pattern => {
        // Simple glob matching
        if (pattern.includes('**')) {
          const prefix = pattern.split('**')[0].replace(/\/$/, '');
          return rel.startsWith(prefix) || rel.includes(`/${prefix}`);
        }
        return rel.includes(pattern);
      });
    };

    const walk = (dir: string) => {
      if (files.length >= maxFiles) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) return;
        const fullPath = path.join(dir, entry.name);

        if (shouldExclude(fullPath)) continue;

        if (entry.isDirectory()) {
          // Skip common non-source directories
          if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'].includes(entry.name)) continue;
          walk(fullPath);
        } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    };

    walk(rootPath);
    return files;
  }

  private _detectEntryPoints(files: string[], rootPath: string): string[] {
    const entryNames = [
      'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx',
      'src/app.ts', 'src/app.tsx', 'src/App.ts', 'src/App.tsx',
      'index.ts', 'index.tsx', 'main.ts', 'main.tsx',
      'src/extension.ts', 'server.ts', 'src/server.ts',
    ];

    const entries: string[] = [];
    for (const name of entryNames) {
      const full = path.join(rootPath, name);
      if (files.includes(full)) entries.push(full);
    }
    return entries;
  }

  private _resolveModule(
    specifier: string,
    fromFile: string,
    options: ts.CompilerOptions,
    rootPath: string
  ): string | undefined {
    // Skip external modules
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('@/')) {
      // Check if it's a path alias from tsconfig
      if (options.paths) {
        for (const [pattern, mappings] of Object.entries(options.paths)) {
          const prefix = pattern.replace('/*', '');
          if (specifier.startsWith(prefix)) {
            const rest = specifier.slice(prefix.length);
            for (const mapping of mappings) {
              const baseDir = options.baseUrl ? path.resolve(rootPath, options.baseUrl) : rootPath;
              const resolved = path.resolve(baseDir, mapping.replace('/*', '') + rest);
              const found = this._tryResolveFile(resolved);
              if (found) return found;
            }
          }
        }
      }
      return undefined;
    }

    // Relative resolution
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, specifier);
    return this._tryResolveFile(resolved);
  }

  private _tryResolveFile(basePath: string): string | undefined {
    // Try exact path
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;

    // Try with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
      const withExt = basePath + ext;
      if (fs.existsSync(withExt)) return withExt;
    }

    // Try as directory with index
    for (const ext of extensions) {
      const indexPath = path.join(basePath, `index${ext}`);
      if (fs.existsSync(indexPath)) return indexPath;
    }

    return undefined;
  }

  private _getImportType(node: ts.ImportDeclaration): ImportEdge['importType'] {
    if (!node.importClause) return 'side-effect';
    if (node.importClause.name) return 'default';
    if (node.importClause.namedBindings) {
      if (ts.isNamespaceImport(node.importClause.namedBindings)) return 'namespace';
      return 'named';
    }
    return 'side-effect';
  }

  private _getImportSpecifiers(node: ts.ImportDeclaration): string[] {
    const specs: string[] = [];
    if (!node.importClause) return specs;

    if (node.importClause.name) {
      specs.push('default');
    }

    if (node.importClause.namedBindings) {
      if (ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) {
          specs.push(element.name.text);
        }
      } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        specs.push('*');
      }
    }

    return specs;
  }

  private _collectExports(node: ts.Node, sourceFile: ts.SourceFile, exports: ExportInfo[]) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasExport = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const hasDefault = modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);

    if (!hasExport) return;

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    if (hasDefault) {
      exports.push({ name: 'default', kind: 'default', line });
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      exports.push({ name: node.name.text, kind: 'function', line });
    } else if (ts.isClassDeclaration(node) && node.name) {
      exports.push({ name: node.name.text, kind: 'class', line });
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exports.push({ name: decl.name.text, kind: 'variable', line });
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      exports.push({ name: node.name.text, kind: 'interface', line });
    } else if (ts.isTypeAliasDeclaration(node)) {
      exports.push({ name: node.name.text, kind: 'type', line });
    } else if (ts.isEnumDeclaration(node)) {
      exports.push({ name: node.name.text, kind: 'enum', line });
    } else if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exports.push({ name: el.name.text, kind: 'reexport', line });
        }
      }
    }
  }
}
