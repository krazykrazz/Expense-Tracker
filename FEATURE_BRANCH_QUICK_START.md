# Feature Branch Quick Start Guide

## 🚀 You're now set up with a feature branch promotion model!

### Current Status
- ✅ **Feature branch created**: `feature/budget-alert-notifications`
- ✅ **Workflow documentation**: `docs/development/FEATURE_BRANCH_WORKFLOW.md`
- ✅ **Automation scripts**: `scripts/create-feature-branch.ps1` and `scripts/promote-feature.ps1`
- ✅ **Helper functions**: `scripts/git-helpers.ps1`

### Quick Commands

#### Create a new feature branch
```powershell
.\scripts\create-feature-branch.ps1 -FeatureName my-feature-name
```

#### Promote feature to main (with tests)
```powershell
.\scripts\promote-feature.ps1 -FeatureName my-feature-name
```

#### Promote feature to main (skip tests)
```powershell
.\scripts\promote-feature.ps1 -FeatureName my-feature-name -SkipTests
```

#### Load helper functions
```powershell
. .\scripts\git-helpers.ps1
Show-Help  # See all available functions
```

### Current Workflow for Budget Alert Notifications

You're currently on the `feature/budget-alert-notifications` branch. Here's what you can do:

1. **Start implementing tasks**:
   ```powershell
   # View the task list
   code .kiro/specs/budget-alert-notifications/tasks.md
   
   # Start with task 1.1: Core alert calculation logic
   ```

2. **Make commits as you work**:
   ```powershell
   git add .
   git commit -m "feat(alerts): implement alert calculation utilities"
   git push origin feature/budget-alert-notifications
   ```

3. **When feature is complete**:
   ```powershell
   .\scripts\promote-feature.ps1 -FeatureName budget-alert-notifications
   ```

### Branch Status
```powershell
# Check current branch
git branch --show-current

# See all branches
git branch -a

# Check status
git status
```

### Key Benefits

✅ **Clean main branch** - Always deployable  
✅ **Isolated development** - Features don't interfere with each other  
✅ **Automated testing** - Tests run before promotion  
✅ **Easy rollback** - Can revert individual features  
✅ **Better tracking** - Clear history of what was added when  

### Next Steps

1. **Start implementing** the budget alert notifications feature
2. **Use the task list** in `.kiro/specs/budget-alert-notifications/tasks.md`
3. **Commit regularly** with descriptive messages
4. **Test thoroughly** before promoting
5. **Promote to main** when ready for production

### Need Help?

- **Full documentation**: `docs/development/FEATURE_BRANCH_WORKFLOW.md`
- **Helper functions**: `. .\scripts\git-helpers.ps1` then `Show-Help`
- **Git status**: `git status` and `git log --oneline -5`

---

**Happy coding! 🎉**