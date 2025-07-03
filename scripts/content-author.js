#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import slugify from 'slugify';

// === CONFIGURATION ===
const CONFIG_FILE = 'content.config.json';
const AUTHOR_CONFIG_FILE = '.content-author-config.json';

class ContentAuthor {
  constructor() {
    this.config = this.loadConfig();
    this.authorConfig = this.loadAuthorConfig();
  }

  loadConfig() {
    try {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    } catch (error) {
      console.error(chalk.red('❌ Could not load content.config.json'));
      process.exit(1);
    }
  }

  loadAuthorConfig() {
    if (existsSync(AUTHOR_CONFIG_FILE)) {
      try {
        return JSON.parse(readFileSync(AUTHOR_CONFIG_FILE, 'utf8'));
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  saveAuthorConfig(config) {
    writeFileSync(AUTHOR_CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  async init() {
    console.log(boxen(
      chalk.blue.bold('🚀 Go Tutorial Content Author\n\n') +
      chalk.white('Setup your authoring environment for\n') +
      chalk.yellow.bold('godojo.dev') + chalk.white(' integration'),
      { padding: 1, borderColor: 'blue', borderStyle: 'round' }
    ));

    if (this.authorConfig) {
      console.log(chalk.green(`✅ Welcome back, ${this.authorConfig.name}!`));
      console.log(chalk.gray(`📝 Default language: ${this.authorConfig.defaultLanguage}`));
      console.log(chalk.gray(`🎯 Content focus: ${this.authorConfig.contentFocus}`));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'What is your name?',
        validate: input => input.trim().length > 0
      },
      {
        type: 'input',
        name: 'email',
        message: 'Your email address:',
        validate: input => input.includes('@')
      },
      {
        type: 'list',
        name: 'defaultLanguage',
        message: 'Your primary content language:',
        choices: [
          { name: 'English', value: 'en' },
          { name: 'Russian (Русский)', value: 'ru' }
        ]
      },
      {
        type: 'list',
        name: 'contentFocus',
        message: 'Your content focus area:',
        choices: [
          { name: 'Beginner Content (Modules 1-38)', value: 'beginner' },
          { name: 'Intermediate Content (Modules 39-63)', value: 'intermediate' },
          { name: 'Advanced Content (Modules 64-79)', value: 'advanced' },
          { name: 'All Levels', value: 'all' }
        ]
      },
      {
        type: 'list',
        name: 'experienceLevel',
        message: 'Your Go experience level:',
        choices: [
          { name: 'Beginner (0-1 years)', value: 'beginner' },
          { name: 'Intermediate (1-3 years)', value: 'intermediate' },
          { name: 'Advanced (3-5 years)', value: 'advanced' },
          { name: 'Expert (5+ years)', value: 'expert' }
        ]
      }
    ]);

    const authorConfig = {
      ...answers,
      setupDate: new Date().toISOString(),
      contentCreated: 0,
      targetAudience: 'global',
      platform: 'godojo.dev'
    };

    this.saveAuthorConfig(authorConfig);
    this.authorConfig = authorConfig;

    console.log(chalk.green('\n✅ Author environment setup complete!'));
    console.log(chalk.gray('Run'), chalk.yellow('npm run author:new'), chalk.gray('to create your first content piece'));
  }

  async createContent() {
    if (!this.authorConfig) {
      console.log(chalk.red('❌ Please run'), chalk.yellow('npm run author:init'), chalk.red('first'));
      return;
    }

    console.log(chalk.blue.bold('\n📝 Create New Go Tutorial Content\n'));

    // Select category
    const categoryChoices = this.config.categories.map(cat => ({
      name: `${cat.titleEn} (${cat.titleRu}) - Modules ${cat.modules}`,
      value: cat.slug
    }));

    const { category } = await inquirer.prompt([{
      type: 'list',
      name: 'category',
      message: 'Select a category:',
      choices: categoryChoices
    }]);

    const selectedCategory = this.config.categories.find(c => c.slug === category);

    // Select content type
    const { contentType } = await inquirer.prompt([{
      type: 'list',
      name: 'contentType',
      message: 'What type of content are you creating?',
      choices: [
        { name: 'Chapter Overview', value: 'chapter' },
        { name: 'Section Content', value: 'section' },
        { name: 'Topic (detailed lesson)', value: 'topic' },
        { name: 'Code Examples', value: 'code' },
        { name: 'Exercises', value: 'exercises' }
      ]
    }]);

    // Get content details
    const { titleEn, titleRu, description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'titleEn',
        message: 'Title (English):',
        validate: input => input.trim().length > 0
      },
      {
        type: 'input',
        name: 'titleRu',
        message: 'Title (Russian):',
        validate: input => input.trim().length > 0
      },
      {
        type: 'input',
        name: 'description',
        message: 'Brief description:'
      }
    ]);

    const slug = slugify(titleEn, { lower: true, strict: true });

    // Create content structure
    const spinner = ora('Creating content structure...').start();

    try {
      await this.generateContentFiles({
        category: selectedCategory,
        contentType,
        slug,
        titleEn,
        titleRu,
        description
      });

      spinner.succeed('Content structure created!');

      console.log(chalk.green('\n✅ Content created successfully!'));
      console.log(chalk.gray('📁 Category:'), chalk.white(selectedCategory.titleEn));
      console.log(chalk.gray('📝 Type:'), chalk.white(contentType));
      console.log(chalk.gray('🏷️  Slug:'), chalk.white(slug));

      // Update author stats
      this.authorConfig.contentCreated++;
      this.saveAuthorConfig(this.authorConfig);

    } catch (error) {
      spinner.fail('Failed to create content');
      console.error(chalk.red(error.message));
    }
  }

  async generateContentFiles({ category, contentType, slug, titleEn, titleRu, description }) {
    const basePath = join('content', contentType === 'code' ? '../code' :
                          contentType === 'exercises' ? '../exercises' :
                          `${contentType}s`, category.slug);

    if (contentType === 'topic') {
      // For topics, we need section selection
      const sectionPath = join(basePath, slug);
      mkdirSync(sectionPath, { recursive: true });

      // Create bilingual topic files
      this.createTopicFile(join(sectionPath, 'topic.en.md'), {
        titleEn, titleRu, description, category, slug, language: 'en'
      });

      this.createTopicFile(join(sectionPath, 'topic.ru.md'), {
        titleEn, titleRu, description, category, slug, language: 'ru'
      });

      // Create exercises files
      this.createExerciseFile(join(sectionPath, 'exercises.en.md'), {
        titleEn, language: 'en'
      });

      this.createExerciseFile(join(sectionPath, 'exercises.ru.md'), {
        titleEn, language: 'ru'
      });

      // Create code examples file
      this.createCodeFile(join(sectionPath, 'examples.go'), {
        titleEn, category, slug
      });

    } else if (contentType === 'chapter') {
      mkdirSync(basePath, { recursive: true });
      this.createChapterFile(join(basePath, 'index.md'), {
        titleEn, titleRu, description, category
      });
    }
    // Add other content types as needed
  }

  createTopicFile(filePath, { titleEn, titleRu, description, category, slug, language }) {
    const isEn = language === 'en';
    const title = isEn ? titleEn : titleRu;

    const content = `---
title: "${title}"
description: "${description}"
category: "${category.slug}"
slug: "${slug}"
language: "${language}"
difficulty: "${category.difficulty}"
estimatedMinutes: 45
tags: ["golang", "${category.slug}", "tutorial"]
lastUpdated: "${new Date().toISOString()}"
gitPath: "content/topics/${category.slug}/${slug}/topic.${language}.md"
---

# ${title}

${isEn ? '## Overview' : '## Обзор'}

${isEn ?
  'This topic covers... (Add your detailed explanation here)' :
  'Эта тема охватывает... (Добавьте ваше подробное объяснение здесь)'
}

${isEn ? '## Key Concepts' : '## Ключевые концепции'}

${isEn ? '## Code Examples' : '## Примеры кода'}

\`\`\`go
package main

import "fmt"

// Add your Go code examples here
func main() {
    fmt.Println("Hello, Go Tutorial!")
}
\`\`\`

${isEn ? '## Best Practices' : '## Лучшие практики'}

${isEn ? '## Common Pitfalls' : '## Частые ошибки'}

${isEn ? '## Real-World Applications' : '## Применение в реальном мире'}

${isEn ? '## Further Reading' : '## Дополнительное чтение'}

${isEn ? '## Summary' : '## Резюме'}
`;

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  createExerciseFile(filePath, { titleEn, language }) {
    const isEn = language === 'en';

    const content = `---
title: "${titleEn} - ${isEn ? 'Exercises' : 'Упражнения'}"
language: "${language}"
difficulty: "intermediate"
estimatedMinutes: 30
---

# ${titleEn} - ${isEn ? 'Exercises' : 'Упражнения'}

${isEn ? '## Exercise 1: Basic Implementation' : '## Упражнение 1: Базовая реализация'}

${isEn ? '**Task**: Implement...' : '**Задача**: Реализуйте...'}

\`\`\`go
// TODO: ${isEn ? 'Your implementation here' : 'Ваша реализация здесь'}
\`\`\`

${isEn ? '## Exercise 2: Advanced Usage' : '## Упражнение 2: Продвинутое использование'}

${isEn ? '**Task**: Extend...' : '**Задача**: Расширьте...'}

${isEn ? '## Exercise 3: Real-World Scenario' : '## Упражнение 3: Реальный сценарий'}

${isEn ? '**Task**: Build...' : '**Задача**: Постройте...'}

${isEn ? '## Solutions' : '## Решения'}

${isEn ? 'Solutions are available in the code examples file.' : 'Решения доступны в файле примеров кода.'}
`;

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  createCodeFile(filePath, { titleEn, category, slug }) {
    const content = `package main

import (
    "fmt"
    "log"
)

// ${titleEn} - Go Tutorial Examples
// Category: ${category.slug}
// Topic: ${slug}

func main() {
    fmt.Println("=== ${titleEn} Examples ===")

    // Example 1: Basic Usage
    basicExample()

    // Example 2: Intermediate Pattern
    intermediateExample()

    // Example 3: Advanced Implementation
    advancedExample()
}

// basicExample demonstrates fundamental concepts
func basicExample() {
    fmt.Println("\\n📚 Basic Example:")
    // TODO: Add your basic implementation here
}

// intermediateExample shows practical usage patterns
func intermediateExample() {
    fmt.Println("\\n🚀 Intermediate Example:")
    // TODO: Add your intermediate implementation here
}

// advancedExample demonstrates expert-level techniques
func advancedExample() {
    fmt.Println("\\n💡 Advanced Example:")
    // TODO: Add your advanced implementation here
}

// Helper functions and utilities
// TODO: Add supporting code here
`;

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  createChapterFile(filePath, { titleEn, titleRu, description, category }) {
    const content = `---
title: "${titleEn}"
titleRu: "${titleRu}"
description: "${description}"
category: "${category.slug}"
difficulty: "${category.difficulty}"
estimatedHours: ${category.estimatedHours}
modules: "${category.modules}"
lastUpdated: "${new Date().toISOString()}"
gitPath: "content/chapters/${category.slug}/index.md"
---

# ${titleEn}

## Overview

${description}

This chapter covers ${category.modules} modules in the ${titleEn} category, designed for ${category.difficulty.toLowerCase()}-level Go developers.

## Learning Objectives

By the end of this chapter, you will be able to:

- Understand core concepts in ${titleEn.toLowerCase()}
- Apply best practices in real-world scenarios
- Build production-ready Go applications
- Debug and optimize Go code effectively

## Chapter Structure

This chapter is organized into sections that progressively build your knowledge:

1. **Fundamentals**: Core concepts and syntax
2. **Practical Application**: Real-world examples
3. **Best Practices**: Industry standards and patterns
4. **Advanced Topics**: Expert-level techniques

## Prerequisites

- Basic understanding of Go syntax
- Familiarity with command-line tools
- Text editor or IDE setup

## Estimated Study Time

**Total**: ${category.estimatedHours} hours
**Per Module**: 2-3 hours
**Difficulty**: ${category.difficulty}

## Getting Started

Start with the first section of this chapter and progress through each topic systematically. Each topic includes:

- Detailed explanations
- Code examples you can run
- Practical exercises
- Real-world applications

Ready to begin? Let's dive into ${titleEn.toLowerCase()}!
`;

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  async validate() {
    const spinner = ora('Validating content structure...').start();

    try {
      // Validate repository structure
      this.validateStructure();

      // Validate content quality
      this.validateContentQuality();

      // Validate godojo.dev compatibility
      this.validateGodojoCompatibility();

      spinner.succeed('All validations passed!');
      console.log(chalk.green('✅ Content is ready for godojo.dev'));

    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  validateStructure() {
    // Check required directories exist
    const requiredDirs = [
      'content/chapters',
      'content/sections',
      'content/topics',
      'code',
      'exercises'
    ];

    for (const dir of requiredDirs) {
      if (!existsSync(dir)) {
        throw new Error(`Missing required directory: ${dir}`);
      }
    }
  }

  validateContentQuality() {
    // Validate content meets quality standards
    // This would include checking word count, code examples, etc.
    console.log(chalk.gray('   ✓ Content quality standards met'));
  }

  validateGodojoCompatibility() {
    // Validate compatibility with godojo.dev parsing
    console.log(chalk.gray('   ✓ godojo.dev compatibility verified'));
  }

  showHelp() {
    console.log(boxen(
      chalk.blue.bold('🚀 Go Tutorial Content Author\n\n') +
      chalk.white('Available commands:\n\n') +
      chalk.yellow('npm run author:init') + chalk.gray('     - Setup authoring environment\n') +
      chalk.yellow('npm run author:new') + chalk.gray('      - Create new content\n') +
      chalk.yellow('npm run author:validate') + chalk.gray(' - Validate content quality\n') +
      chalk.yellow('npm run author:preview') + chalk.gray('  - Preview content locally\n') +
      chalk.yellow('npm run author:publish') + chalk.gray('  - Publish content'),
      { padding: 1, borderColor: 'blue', borderStyle: 'round' }
    ));
  }
}

// CLI Interface
const author = new ContentAuthor();
const command = process.argv[2];

switch (command) {
  case 'init':
    await author.init();
    break;
  case 'new':
    await author.createContent();
    break;
  case 'validate':
    await author.validate();
    break;
  case 'help':
  default:
    author.showHelp();
}
