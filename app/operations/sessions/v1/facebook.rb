module Sessions
  module V1
    class Facebook < Operation
      def process
        user = User.find_by(email: email)
        if user

        else
          user = User.new(provider: provider, uid: uid)
          user.email = email
        end
      end

      private

      def uid
        auth['id']
      end

      def email
        auth['email'] || "#{auth['id']}@facebook.com"
      end

      def provider
        'facebook'
      end

      def auth
        params[:auth]
      end
    end
  end
end
