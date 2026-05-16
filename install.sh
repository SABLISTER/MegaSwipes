dirname =$(pwd)

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# in lieu of restarting the shell
\. "$HOME/.nvm/nvm.sh"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  
# Download and install Node.js:
nvm install 20
# Verify the Node.js version:
nvm use 20

node -v # Should print 20.19.5
# Verify npm version:
npm -v # Should print 10.8.2
cd $dirname
npm rebuild
npm install
npm audit fix
cd frontend
npm rebuild
npm install
npm audit fix

Echo "all done"